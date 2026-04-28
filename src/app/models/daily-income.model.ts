import type { SaleType } from './sale.model';

export interface DailyIncome {
  business_id: string;
  day: string;
  type: SaleType;
  transactions: number;
  total: number;
}
