import { describe, expect, it } from 'vitest';
import {
  assertSafeDimensions,
  assertSafeImageFile,
  ImageRejectedError,
  MAX_INPUT_PIXELS,
  readHeaderDimensions,
  sniffImageType,
} from './image-guard';

const bytes = (...values: number[]) => new Uint8Array(values);
const ascii = (text: string) => new Uint8Array([...text].map((c) => c.charCodeAt(0)));

function fileFrom(content: Uint8Array, name: string, type: string): File {
  // Uint8Array vale como BlobPart; el cast evita el ruido de tipos de lib.dom.
  return new File([content as BlobPart], name, { type });
}

const JPEG = bytes(0xff, 0xd8, 0xff, 0xe0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0);
const PNG = bytes(0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0, 0, 0, 0, 0, 0, 0, 0);

/**
 * Contenedor RIFF: "RIFF" + 4 bytes de tamaño (irrelevantes para el sniffeo)
 * + el fourcc del formato. Sirve tanto para WebP como para WAV.
 */
function riff(payload: string): Uint8Array {
  const buf = new Uint8Array(16);
  buf.set(ascii('RIFF'), 0);
  buf.set([0x24, 0x00, 0x00, 0x00], 4);
  buf.set(ascii(payload), 8);
  return buf;
}

/** PNG de 32 bytes con una cabecera IHDR completa y las medidas pedidas. */
function pngWithSize(width: number, height: number): Uint8Array {
  const png = new Uint8Array(32);
  png.set(PNG.slice(0, 8), 0);
  png.set(ascii('IHDR'), 12);
  const view = new DataView(png.buffer);
  view.setUint32(16, width, false);
  view.setUint32(20, height, false);
  return png;
}

describe('sniffImageType', () => {
  it('reconoce los formatos de la lista blanca', () => {
    expect(sniffImageType(JPEG)).toBe('jpeg');
    expect(sniffImageType(PNG)).toBe('png');
    expect(sniffImageType(riff('WEBPVP8 '))).toBe('webp');
    expect(sniffImageType(ascii('GIF89a__________'))).toBe('gif');
    expect(sniffImageType(ascii('GIF87a__________'))).toBe('gif');
  });

  it('no confunde un RIFF que no es WebP (ej: un WAV)', () => {
    expect(sniffImageType(riff('WAVEfmt '))).toBeNull();
  });

  it('rechaza SVG, que es el vector de XSS de un bucket público', () => {
    expect(sniffImageType(ascii('<svg xmlns="http'))).toBeNull();
    expect(sniffImageType(ascii('<?xml version="1'))).toBeNull();
  });

  it('rechaza HTML y PDF', () => {
    expect(sniffImageType(ascii('<!DOCTYPE html>_'))).toBeNull();
    expect(sniffImageType(ascii('%PDF-1.7________'))).toBeNull();
  });
});

describe('assertSafeImageFile', () => {
  it('acepta un JPEG con su content-type correcto', async () => {
    await expect(assertSafeImageFile(fileFrom(JPEG, 'foto.jpg', 'image/jpeg'))).resolves.toBe('jpeg');
  });

  it('acepta image/jpg, que algunos navegadores declaran así', async () => {
    await expect(assertSafeImageFile(fileFrom(JPEG, 'foto.jpg', 'image/jpg'))).resolves.toBe('jpeg');
  });

  it('acepta un content-type vacío si los bytes son válidos', async () => {
    await expect(assertSafeImageFile(fileFrom(PNG, 'foto.png', ''))).resolves.toBe('png');
  });

  it('rechaza un SVG aunque se declare como imagen', async () => {
    const svg = ascii('<svg onload="fetch(`/steal`)"></svg>');
    await expect(assertSafeImageFile(fileFrom(svg, 'logo.svg', 'image/svg+xml'))).rejects.toThrow(
      ImageRejectedError,
    );
  });

  it('rechaza un HTML renombrado a .png con content-type falsificado', async () => {
    const html = ascii('<!DOCTYPE html><script>alert(1)</script>');
    await expect(assertSafeImageFile(fileFrom(html, 'foto.png', 'image/png'))).rejects.toThrow(
      /no es una imagen/i,
    );
  });

  it('rechaza cuando los bytes contradicen la extensión declarada', async () => {
    // Bytes de PNG reales presentados como JPEG: archivo renombrado a mano.
    await expect(assertSafeImageFile(fileFrom(PNG, 'foto.jpg', 'image/jpeg'))).rejects.toThrow(
      /no coincide con su extensión/i,
    );
  });

  it('rechaza un archivo vacío', async () => {
    await expect(assertSafeImageFile(fileFrom(new Uint8Array(0), 'x.jpg', 'image/jpeg'))).rejects.toThrow(
      /vacío/i,
    );
  });

  it('rechaza un archivo por encima del techo de entrada', async () => {
    const huge = new Uint8Array(13 * 1024 * 1024);
    huge.set(JPEG, 0);
    await expect(assertSafeImageFile(fileFrom(huge, 'grande.jpg', 'image/jpeg'))).rejects.toThrow(/MB/);
  });

  it('explica el caso HEIC en vez de dar un error genérico', async () => {
    // ISO-BMFF: 4 bytes de tamaño de caja, luego 'ftyp' y el brand.
    const heic = new Uint8Array(16);
    heic.set([0x00, 0x00, 0x00, 0x18], 0);
    heic.set(ascii('ftypheic'), 4);
    await expect(assertSafeImageFile(fileFrom(heic, 'IMG_0001.heic', ''))).rejects.toThrow(/HEIC/);
  });
});

describe('readHeaderDimensions', () => {
  it('lee el IHDR de un PNG', () => {
    const png = pngWithSize(1920, 1080);
    expect(readHeaderDimensions(png, 'png')).toEqual({ width: 1920, height: 1080 });
  });

  it('lee el screen descriptor de un GIF', () => {
    const gif = new Uint8Array(32);
    gif.set(ascii('GIF89a'), 0);
    new DataView(gif.buffer).setUint16(6, 800, true);
    new DataView(gif.buffer).setUint16(8, 600, true);
    expect(readHeaderDimensions(gif, 'gif')).toEqual({ width: 800, height: 600 });
  });

  it('no intenta adivinar en JPEG (queda para el chequeo post-decodificado)', () => {
    expect(readHeaderDimensions(JPEG, 'jpeg')).toBeNull();
  });

  it('corta un PNG bomba antes de decodificarlo', async () => {
    const bomb = fileFrom(pngWithSize(30_000, 30_000), 'bomba.png', 'image/png');
    await expect(assertSafeImageFile(bomb)).rejects.toThrow(/demasiado grande/i);
  });
});

describe('assertSafeDimensions', () => {
  it('deja pasar una foto de cámara normal', () => {
    expect(() => assertSafeDimensions(4032, 3024)).not.toThrow();
  });

  it('corta una bomba de descompresión', () => {
    expect(() => assertSafeDimensions(30_000, 30_000)).toThrow(ImageRejectedError);
    expect(30_000 * 30_000).toBeGreaterThan(MAX_INPUT_PIXELS);
  });

  it('rechaza dimensiones nulas', () => {
    expect(() => assertSafeDimensions(0, 100)).toThrow(ImageRejectedError);
  });
});
