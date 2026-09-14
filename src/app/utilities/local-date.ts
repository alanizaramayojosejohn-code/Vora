// Fechas en hora LOCAL, no UTC. `toISOString()` convierte a UTC y en Bolivia
// (UTC-4) eso adelanta un día durante toda la tarde: a las 20:00 del lunes
// ya devolvería el martes, y un reporte de "Hoy" (o del mes en curso)
// mostraría el día o el mes equivocado. Este bug ya pasó en producción.

/** 'YYYY-MM-DD' del día `d` en hora local. */
export function localDate(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

/** 'YYYY-MM-01' del mes de `d` en hora local. */
export function localMonthStart(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  return `${y}-${m}-01`;
}
