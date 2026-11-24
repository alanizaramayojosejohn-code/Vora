// Iniciales para los avatares de las listas y los modales de borrado.
//
// Estaba copiada en 19 archivos con dos convenciones de vacío distintas: las
// listas y el sidebar muestran '··' cuando no hay nombre, y los modales de
// borrado esperan null para no pintar el círculo. Se conservan las dos.

// Una palabra → sus dos primeras letras; dos o más → la inicial de las dos
// primeras. 'Café' → 'CA'; 'Juan Pérez Gómez' → 'JP'.
export function initials(name: string | null | undefined, fallback = '··'): string {
  const parts = (name ?? '').trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return fallback;
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
  return (parts[0][0] + parts[1][0]).toUpperCase();
}

// Variante para los modales de borrado, que distinguen "sin nombre" de "··".
export function initialsOrNull(name: string | null | undefined): string | null {
  const value = initials(name, '');
  return value === '' ? null : value;
}
