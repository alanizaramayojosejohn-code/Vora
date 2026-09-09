export interface MonthlyIncome {
  business_id: string;
  month: string;
  total: number;
  transactions: number;
  // Costo y ganancia bruta del mes, congelados por venta (spec 002). La
  // utilidad después de sueldos no vive acá: se cruza en el cliente contra
  // payroll_monthly por período (RF-14).
  cost: number;
  profit: number;
}
