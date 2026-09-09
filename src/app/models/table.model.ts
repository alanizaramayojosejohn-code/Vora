// Mesa del salón. No tiene posición ni forma a propósito: la mesa es un dato
// del pedido que se elige en un selector, no un dibujo del salón (spec 001,
// "fuera de alcance").
export interface Table {
  id: string;
  business_id: string;
  name: string;
  is_active: boolean;
  created_at: string;
}

export const TAKEAWAY_LABEL = 'Para llevar';

// Orden natural de un salón: "Mesa 2" antes que "Mesa 10". Un sort alfabético
// las pone al revés y el cajero termina buscando la suya en una lista que no
// sigue ninguna lógica visible.
export function compareTableNames(a: string, b: string): number {
  return a.localeCompare(b, 'es', { numeric: true, sensitivity: 'base' });
}
