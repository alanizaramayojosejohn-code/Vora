// Margen como porcentaje del ingreso. Null y no 0 cuando el ingreso es cero
// (RF-10 de la spec 002): un margen de "0%" diría que no hubo ni ganancia ni
// pérdida, cuando en realidad no hay ingreso sobre el que calcular ningún
// porcentaje — son cosas distintas y hay que poder distinguirlas en la UI
// (mostrar "—" en vez de "0%").
export function computeMargin(profit: number, revenue: number): number | null {
  if (revenue === 0) return null;
  return (profit / revenue) * 100;
}

export interface ProfitTotals {
  revenue: number;
  cost: number;
  profit: number;
}

export const EMPTY_PROFIT_TOTALS: ProfitTotals = { revenue: 0, cost: 0, profit: 0 };

export function sumProfitTotals(rows: ProfitTotals[]): ProfitTotals {
  return rows.reduce(
    (acc, r) => ({
      revenue: acc.revenue + r.revenue,
      cost: acc.cost + r.cost,
      profit: acc.profit + r.profit,
    }),
    { ...EMPTY_PROFIT_TOTALS },
  );
}

// Utilidad después de sueldos (RF-14): solo tiene sentido a nivel mensual, y
// solo cuando el negocio tiene sueldos registrados ese mes (RF-16) — por eso
// devuelve null en vez de restar cero, para que la UI decida no mostrar la
// línea en vez de mostrar una "utilidad después de sueldos" idéntica a la
// bruta.
export function netProfitAfterPayroll(profit: number, payrollPaid: number | null): number | null {
  if (payrollPaid === null) return null;
  return profit - payrollPaid;
}
