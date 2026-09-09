export interface DailyIncome {
  business_id: string;
  day: string;
  total: number;
  transactions: number;
  // Costo y ganancia bruta del día, congelados por venta (spec 002).
  cost: number;
  profit: number;
}
