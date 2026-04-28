import type { SaleType } from './sale.model';

export interface MonthlyIncome {
  business_id: string;
  month: string;
  type: SaleType;
  transactions: number;
  total: number;
}
