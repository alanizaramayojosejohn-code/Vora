// Compresor de imágenes de producto.
//
// Todo lo que sube pasa por acá y sale como WebP de 600 px de lado máximo,
// apuntando a ~45 KB. Dos razones:
//
//   1. Egress. Cada miniatura se descarga en cada tablet que abre el POS.
//      Un catálogo de 150 productos a 40 KB son 6 MB; a 2 MB por foto serían
//      300 MB, y el plan gratuito de Supabase da 5 GB de tráfico al mes.
//   2. Seguridad. Redibujar en un canvas y volver a codificar descarta todo
//      lo que no sean píxeles: EXIF, comentarios, chunks arbitrarios, colas
//      de archivo. Un polyglot que hubiera sobrevivido al sniffeo de bytes
//      no sobrevive al re-encode, porque lo que se sube es un archivo nuevo
//      generado por el navegador, no el que eligió el usuario.
//
// Ver image-guard.ts para la validación previa.

import { assertSafeDimensions, assertSafeImageFile, ImageRejectedError } from './image-guard';

/** Lado mayor de la miniatura. 600 px se ve nítido en la grilla del POS. */
export const PRODUCT_IMAGE_MAX_SIDE = 600;

/** Peso al que apunta el bucle de calidad. */
export const PRODUCT_IMAGE_TARGET_BYTES = 45 * 1024;

export interface CompressOptions {
  maxSide?: number;
  targetBytes?: number;
  startQuality?: number;
  minQuality?: number;
}

export interface CompressedImage {
  /** Archivo WebP nuevo, listo para subir. Nombre generado, nunca el del usuario. */
  file: File;
  width: number;
  height: number;
  /** Peso del archivo original, para poder mostrar cuánto se ahorró. */
  originalBytes: number;
  bytes: number;
}

function drawToBlob(
  bitmap: ImageBitmap,
  width: number,
  height: number,
  quality: number,
): Promise<Blob | null> {
  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext('2d');
  if (!ctx) throw new ImageRejectedError('El navegador no pudo procesar la imagen.');
  // imageSmoothingQuality alto: sin esto el downscale de 4000 a 600 px deja
  // bordes con aliasing bien visible en los textos de las etiquetas.
  ctx.imageSmoothingEnabled = true;
  ctx.imageSmoothingQuality = 'high';
  ctx.drawImage(bitmap, 0, 0, width, height);
  return new Promise((resolve) => canvas.toBlob(resolve, 'image/webp', quality));
}

/**
 * Valida, redimensiona y re-codifica el archivo a WebP.
 * Lanza ImageRejectedError con un mensaje mostrable si el archivo no sirve.
 */
export async function compressProductImage(
  file: File,
  options: CompressOptions = {},
): Promise<CompressedImage> {
  const maxSide = options.maxSide ?? PRODUCT_IMAGE_MAX_SIDE;
  const targetBytes = options.targetBytes ?? PRODUCT_IMAGE_TARGET_BYTES;
  const minQuality = options.minQuality ?? 0.5;
  let quality = options.startQuality ?? 0.82;

  await assertSafeImageFile(file);

  // createImageBitmap decodifica en el decodificador de imágenes del
  // navegador, no en un parser de documentos: no ejecuta scripts ni resuelve
  // referencias externas, a diferencia de meter el archivo en un <img> o de
  // inyectarlo en el DOM.
  let bitmap: ImageBitmap;
  try {
    bitmap = await createImageBitmap(file);
  } catch {
    throw new ImageRejectedError('No se pudo leer la imagen. Puede estar dañada o incompleta.');
  }

  try {
    assertSafeDimensions(bitmap.width, bitmap.height);

    // Nunca se agranda: una foto de 200 px estirada a 600 se ve peor y pesa más.
    const scale = Math.min(1, maxSide / Math.max(bitmap.width, bitmap.height));
    const width = Math.max(1, Math.round(bitmap.width * scale));
    const height = Math.max(1, Math.round(bitmap.height * scale));

    // Bucle de calidad: se baja de a 0,1 hasta entrar en el objetivo. Las
    // fotos con mucho detalle (un plato lleno) necesitan más pasadas que un
    // producto sobre fondo plano; con un valor fijo o se ve mal o pesa de más.
    let blob: Blob | null = null;
    while (quality >= minQuality) {
      blob = await drawToBlob(bitmap, width, height, quality);
      if (!blob) break;
      if (blob.size <= targetBytes) break;
      quality = Math.round((quality - 0.1) * 100) / 100;
    }

    if (!blob) {
      throw new ImageRejectedError('El navegador no pudo comprimir la imagen.');
    }

    // toBlob cae en PNG cuando el navegador no sabe codificar WebP. Ese archivo
    // rebotaría en el bucket, que solo acepta image/webp, con un error opaco;
    // mejor cortar acá con un mensaje entendible.
    if (blob.type !== 'image/webp') {
      throw new ImageRejectedError(
        'Tu navegador no puede convertir imágenes a WebP. Actualizalo o probá desde Chrome.',
      );
    }

    return {
      // El nombre lo genera el sistema. El del usuario nunca se propaga: es
      // texto controlado por quien sube y termina en una ruta y en una URL.
      file: new File([blob], 'product.webp', { type: 'image/webp' }),
      width,
      height,
      originalBytes: file.size,
      bytes: blob.size,
    };
  } finally {
    bitmap.close();
  }
}

/** "1,4 MB" / "38 KB" — para mostrar el antes y después en el formulario. */
export function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${Math.round(bytes / 1024)} KB`;
  return `${(bytes / 1024 / 1024).toFixed(1)} MB`;
}
