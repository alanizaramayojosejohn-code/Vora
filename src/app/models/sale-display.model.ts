import { TAKEAWAY_LABEL } from './table.model';

// Minutos desde que se abrió una cuenta pendiente, para "N ítems · X min" en
// la franja de cuentas abiertas (rediseño). Recibe el "ahora" como parámetro
// (y no Date.now() interno) para que el llamador controle cuándo refrescar:
// en el componente eso lo maneja un signal de reloj, no esta función.
export function elapsedMinutes(createdAt: string, nowMs: number): number {
  const diff = nowMs - new Date(createdAt).getTime();
  return Math.max(0, Math.round(diff / 60_000));
}

// "07" para "Mesa 07", "—" para llevar, iniciales para cualquier otro nombre
// de mesa: el badge de la tarjeta de cuenta abierta (rediseño).
export function destinationBadge(destination: string): string {
  if (destination === TAKEAWAY_LABEL) return '—';
  const digits = destination.match(/(\d+)\s*$/);
  if (digits) return digits[1].padStart(2, '0');
  return destination.trim().slice(0, 2).toUpperCase();
}

export const CATEGORY_TEXT_CLASSES = [
  'text-cat-1', 'text-cat-2', 'text-cat-3', 'text-cat-4', 'text-cat-5', 'text-cat-6',
];
export const CATEGORY_DOT_CLASSES = [
  'bg-cat-1', 'bg-cat-2', 'bg-cat-3', 'bg-cat-4', 'bg-cat-5', 'bg-cat-6',
];

// Color categórico estable por nombre de categoría (rediseño: texto de
// categoría en la tarjeta de producto y punto en el chip de filtro). El
// índice sale de la lista de categorías ya ordenada, así que una misma
// categoría no cambia de color mientras dure la sesión.
export function categoryTextClass(name: string | null | undefined, categories: string[]): string {
  if (!name) return 'text-foreground-faint';
  const idx = categories.indexOf(name);
  return CATEGORY_TEXT_CLASSES[idx >= 0 ? idx % 6 : 0];
}

export function categoryDotClass(name: string, categories: string[]): string {
  const idx = categories.indexOf(name);
  return CATEGORY_DOT_CLASSES[idx >= 0 ? idx % 6 : 0];
}
