export type CashSessionStatus = 'open' | 'closed';

export interface CashSession {
  id: string;
  business_id: string;
  status: CashSessionStatus;
  opening_float: number;
  opened_by: string | null;
  opened_at: string;
  closed_by: string | null;
  closed_at: string | null;
  counted_cash: number | null;
  expected_cash: number | null;
  difference: number | null;
  notes: string | null;
  created_at: string;
}

// Con el nombre del cajero resuelto, para el reporte del admin.
export interface CashSessionWithCashier extends CashSession {
  cashier_name: string | null;
}

// Devuelto por cash_session_summary(). `expected_cash` y `cash_sales` NO se
// muestran al cajero mientras el turno está abierto: si ve el número que
// "debería" haber, el arqueo deja de medir nada.
export interface CashSessionSummary {
  session_id: string;
  status: CashSessionStatus;
  opening_float: number;
  sales_count: number;
  cash_sales: number;
  card_sales: number;
  qr_sales: number;
  expected_cash: number;
  counted_cash: number | null;
  difference: number | null;
}

export interface CloseCashSessionResult {
  session_id: string;
  opening_float: number;
  cash_sales: number;
  expected_cash: number;
  counted_cash: number;
  difference: number;
}

export function differenceLabel(difference: number): string {
  if (difference === 0) return 'Cuadra exacto';
  return difference > 0 ? 'Sobrante' : 'Faltante';
}
