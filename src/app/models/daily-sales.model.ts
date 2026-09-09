import { PaymentMethod } from './order.model';

// Una fila de la vista sales_by_payment_daily: un día, un método de pago.
export interface SalesByPaymentDay {
  business_id: string;
  day: string;  // 'YYYY-MM-DD' en hora de Bolivia, no UTC
  payment_method: PaymentMethod;
  total: number;
  transactions: number;
}

// Lo que consume la pantalla: el rango ya colapsado a un solo resumen.
export interface DailySalesSummary {
  total: number;
  transactions: number;
  avgTicket: number;
  byMethod: Record<PaymentMethod, number>;
}

export interface TopProduct {
  product_id: string | null;
  product_name: string;
  quantity: number;
  total: number;
  // Costo y ganancia bruta del producto en el rango, y su margen — null
  // cuando el producto no tuvo ingreso (spec 002, RF-17).
  cost: number;
  profit: number;
  margin: number | null;
}

export type TopProductOrderBy = 'quantity' | 'profit';

export const EMPTY_DAILY_SUMMARY: DailySalesSummary = {
  total: 0,
  transactions: 0,
  avgTicket: 0,
  byMethod: { cash: 0, card: 0, qr: 0 },
};

// Colapsa las filas por método de pago en un único resumen del rango.
export function summarizeDailySales(rows: SalesByPaymentDay[]): DailySalesSummary {
  const summary: DailySalesSummary = {
    total: 0,
    transactions: 0,
    avgTicket: 0,
    byMethod: { cash: 0, card: 0, qr: 0 },
  };

  for (const row of rows) {
    const total = Number(row.total);
    summary.total += total;
    summary.transactions += row.transactions;
    summary.byMethod[row.payment_method] += total;
  }

  summary.avgTicket =
    summary.transactions === 0 ? 0 : summary.total / summary.transactions;
  return summary;
}
