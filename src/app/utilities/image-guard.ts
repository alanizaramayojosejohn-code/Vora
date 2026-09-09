// Validación de archivos de imagen antes de tocarlos.
//
// El riesgo concreto de un bucket público de imágenes no es que alguien suba
// una foto fea, es que suba algo que el navegador ejecute:
//
//   · Un SVG es XML, no un bitmap: admite <script> y handlers onload. Servido
//     desde el bucket, abrir esa URL corre JavaScript. Por eso NO está en la
//     lista blanca aunque sea "una imagen".
//   · Un polyglot es un archivo que es JPEG válido y HTML válido a la vez.
//     Pasa cualquier chequeo de extensión y de content-type declarado.
//   · El campo `type` de un File viene de la extensión del nombre, no del
//     contenido. Renombrar payload.html a foto.jpg lo cambia. No se confía.
//
// Contra eso, este módulo mira los bytes reales del archivo (magic numbers) y
// exige que coincidan con la lista blanca. La segunda mitad de la defensa está
// en image-compressor.ts: re-dibujar en canvas descarta todo lo que no sean
// píxeles. La tercera está en la policy del bucket, que es la única que un
// atacante no puede saltear porque no corre en su máquina.

export type SniffedImageType = 'jpeg' | 'png' | 'webp' | 'gif';

/** Techo del archivo de entrada. Una foto de celular ronda los 3-5 MB. */
export const MAX_INPUT_BYTES = 12 * 1024 * 1024;

/**
 * Techo de píxeles a decodificar. Un PNG de 30.000 × 30.000 pesa poco
 * comprimido y reserva ~3,6 GB al descomprimirse: es una bomba de
 * descompresión, y en una tablet de caja se traduce en pestaña muerta.
 * 40 MP deja pasar cualquier cámara real (una de 48 MP ya es un caso raro).
 */
export const MAX_INPUT_PIXELS = 40_000_000;

export class ImageRejectedError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'ImageRejectedError';
  }
}

const startsWith = (bytes: Uint8Array, signature: readonly number[]): boolean =>
  signature.every((byte, i) => bytes[i] === byte);

const asciiAt = (bytes: Uint8Array, offset: number, text: string): boolean =>
  [...text].every((char, i) => bytes[offset + i] === char.charCodeAt(0));

/**
 * Devuelve el tipo real según los primeros bytes, o null si no es ninguno de
 * los formatos aceptados. No mira el nombre ni el content-type declarado.
 */
export function sniffImageType(bytes: Uint8Array): SniffedImageType | null {
  if (startsWith(bytes, [0xff, 0xd8, 0xff])) return 'jpeg';
  if (startsWith(bytes, [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])) return 'png';
  // RIFF....WEBP — el tamaño va en los 4 bytes del medio, se saltean.
  if (asciiAt(bytes, 0, 'RIFF') && asciiAt(bytes, 8, 'WEBP')) return 'webp';
  if (asciiAt(bytes, 0, 'GIF87a') || asciiAt(bytes, 0, 'GIF89a')) return 'gif';
  return null;
}

/** Formatos que reconocemos solo para poder explicar por qué se rechazan. */
function describeRejected(bytes: Uint8Array): string {
  // HEIC/HEIF: contenedor ISO-BMFF, marca "ftyp" + brand en el offset 4.
  if (asciiAt(bytes, 4, 'ftyp')) {
    const brand = String.fromCharCode(...bytes.slice(8, 12));
    if (/^(heic|heix|hevc|mif1|msf1|heim)/.test(brand)) {
      return 'La foto está en formato HEIC (el de iPhone) y el navegador no puede leerlo. Abrila en Fotos y compartila como JPG, o sacale una captura de pantalla.';
    }
  }

  // Texto: SVG, HTML, XML. Es el caso que de verdad importa bloquear.
  const head = String.fromCharCode(...bytes.slice(0, 16)).trim().toLowerCase();
  if (head.startsWith('<svg') || head.startsWith('<?xml') || head.startsWith('<!doctype') || head.startsWith('<html')) {
    return 'Ese archivo no es una imagen: es un documento que el navegador puede ejecutar. Solo se aceptan fotos JPG, PNG, WebP o GIF.';
  }

  if (startsWith(bytes, [0x25, 0x50, 0x44, 0x46])) {
    return 'Ese archivo es un PDF, no una imagen. Solo se aceptan fotos JPG, PNG, WebP o GIF.';
  }

  return 'El archivo no es una imagen válida. Solo se aceptan fotos JPG, PNG, WebP o GIF.';
}

/**
 * Lee el alto y ancho de la cabecera, sin decodificar la imagen.
 *
 * Solo PNG y GIF, que es donde vive la bomba de descompresión clásica: ambos
 * declaran las dimensiones en bytes fijos del comienzo. JPEG las esconde
 * detrás de un escaneo de marcadores y WebP tiene tres variantes de cabecera;
 * para esos dos el control queda en assertSafeDimensions() post-decodificado.
 */
export function readHeaderDimensions(
  bytes: Uint8Array,
  type: SniffedImageType,
): { width: number; height: number } | null {
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  if (type === 'png' && bytes.byteLength >= 24) {
    // IHDR: ancho en el offset 16, alto en el 20, big endian.
    return { width: view.getUint32(16, false), height: view.getUint32(20, false) };
  }
  if (type === 'gif' && bytes.byteLength >= 10) {
    // Logical screen descriptor: offset 6 y 8, little endian.
    return { width: view.getUint16(6, true), height: view.getUint16(8, true) };
  }
  return null;
}

/**
 * Verifica que el archivo sea realmente una de las imágenes aceptadas.
 * Lanza ImageRejectedError con un mensaje mostrable al usuario si no lo es.
 */
export async function assertSafeImageFile(file: File): Promise<SniffedImageType> {
  if (file.size === 0) {
    throw new ImageRejectedError('El archivo está vacío.');
  }
  if (file.size > MAX_INPUT_BYTES) {
    const mb = (file.size / 1024 / 1024).toFixed(1);
    throw new ImageRejectedError(
      `La imagen pesa ${mb} MB y el máximo es ${MAX_INPUT_BYTES / 1024 / 1024} MB. Sacá una foto con menos resolución.`,
    );
  }

  // 16 bytes alcanzan para las firmas; 32 para leer además la cabecera de
  // dimensiones de PNG y GIF sin decodificar nada.
  const bytes = new Uint8Array(await file.slice(0, 32).arrayBuffer());
  const sniffed = sniffImageType(bytes);
  if (!sniffed) {
    throw new ImageRejectedError(describeRejected(bytes));
  }

  // Chequeo de bomba ANTES de decodificar, cuando el formato lo permite.
  // Después de decodificar la memoria ya se reservó y el daño está hecho.
  const declaredSize = readHeaderDimensions(bytes, sniffed);
  if (declaredSize) {
    assertSafeDimensions(declaredSize.width, declaredSize.height);
  }

  // El content-type declarado no decide nada, pero si contradice a los bytes
  // es señal de un archivo renombrado a propósito. Vacío se acepta: varios
  // selectores de Android no lo completan.
  const declared = file.type.toLowerCase();
  if (declared && declared !== `image/${sniffed}` && !(sniffed === 'jpeg' && declared === 'image/jpg')) {
    throw new ImageRejectedError(
      'El contenido del archivo no coincide con su extensión. Volvé a exportar la imagen desde tu galería.',
    );
  }

  return sniffed;
}

/** Corta antes de reservar memoria por una imagen absurdamente grande. */
export function assertSafeDimensions(width: number, height: number): void {
  if (width < 1 || height < 1) {
    throw new ImageRejectedError('La imagen no tiene dimensiones válidas.');
  }
  if (width * height > MAX_INPUT_PIXELS) {
    throw new ImageRejectedError(
      `La imagen es de ${width}×${height} px y es demasiado grande para procesarla. Reducila antes de subirla.`,
    );
  }
}
