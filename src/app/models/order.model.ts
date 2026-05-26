export type PaymentMethod = 'cash' | 'card' | 'qr';

export interface OrderItem {
  id: string;
  order_id: string;
  business_id: string;
  product_id: string | null;
  quantity: number;
  unit_price: number;
  created_at: string;
}

export interface OrderItemWithDetails extends OrderItem {
  product_name: string | null;
}

export interface Order {
  id: string;
  business_id: string;
  client_id: string | null;
  payment_method: PaymentMethod;
  total_amount: number;
  notes: string | null;
  cancelled_at: string | null;
  cancelled_by: string | null;
  cancel_reason: string | null;
  created_by: string | null;
  created_at: string;
}

export interface OrderWithDetails extends Order {
  client_label: string | null;
  items: OrderItemWithDetails[];
}

export function orderPrimaryLabel(order: OrderWithDetails): string {
  const first = order.items[0];
  if (!first) return '—';
  const name = first.product_name;
  const extra = order.items.length - 1;
  return extra > 0 ? `${name ?? '—'} (+${extra} más)` : (name ?? '—');
}

export const PAYMENT_METHOD_LABEL: Record<PaymentMethod, string> = {
  cash: 'Efectivo',
  card: 'Tarjeta',
  qr: 'QR',
};
