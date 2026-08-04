// Fila de la vista client_sales_summary: un renglón por cliente, con su
// historial ya agregado en la base.
export interface ClientSalesSummary {
  business_id: string;
  client_id: string;
  name: string;
  ci: string | null;
  nit: string | null;
  phone: string | null;
  orders_count: number;
  total_spent: number;
  avg_ticket: number;
  last_purchase_at: string | null;   // null = nunca compró
  first_purchase_at: string | null;
}

// Cuántas ventas quedaron asociadas a un cliente. Mide si el equipo está
// registrando clientes en la caja: sin esto, el resto de los reportes de
// cliente describe una muestra sesgada y nadie se entera.
export interface ClientCoverage {
  identified: number;
  total: number;
  percentage: number;
}

// Días sin comprar. `null` cuando el cliente no tiene ninguna compra.
export function daysSinceLastPurchase(
  row: ClientSalesSummary,
  today: Date = new Date(),
): number | null {
  if (!row.last_purchase_at) return null;
  const last = new Date(row.last_purchase_at);
  const diff = today.getTime() - last.getTime();
  return Math.floor(diff / (1000 * 60 * 60 * 24));
}

export const INACTIVE_CLIENT_DAYS = 30;
