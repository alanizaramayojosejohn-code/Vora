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

export interface PaymentMethodStyle {
  classes: string;
  // Cada string es el `d` de un <path>. Con esto alcanza para los tres
  // íconos de abajo (billete, tarjeta, QR) sin necesitar <rect>/<line>/
  // innerHTML: un solo @for en la plantilla los dibuja a todos igual.
  paths: string[];
}

// Un color y un ícono por método, para leer la columna de pago de un
// vistazo sin pasar por el texto. cash usa success (dinero en mano) y card
// usa primary (el tono de marca, con contraste garantizado en cualquier
// preset). qr usa accent en relleno sólido y no en versión traslúcida:
// accent puede ser blanco puro en algunos presets (monochrome), así que
// solo el par accent/accent-fg asegura contraste — accent/10 + accent no.
export const PAYMENT_METHOD_STYLE: Record<PaymentMethod, PaymentMethodStyle> = {
  cash: {
    classes: 'bg-success/10 text-success border-success/20',
    paths: ['M12 2v20', 'M17 5H9.5a3.5 3.5 0 0 0 0 7h5a3.5 3.5 0 0 1 0 7H6'],
  },
  card: {
    classes: 'bg-primary/10 text-primary border-primary/20',
    paths: ['M2 5h20v14H2z', 'M2 10h20'],
  },
  qr: {
    classes: 'bg-accent text-accent-fg border-transparent',
    paths: [
      'M3 3h5v5H3z', 'M16 3h5v5h-5z', 'M3 16h5v5H3z',
      'M21 16h-3a2 2 0 0 0-2 2v3', 'M21 21v.01', 'M12 7v3a2 2 0 0 1-2 2H7',
      'M3 12h.01', 'M12 3h.01', 'M12 16v.01', 'M16 12h1', 'M21 12v.01', 'M12 21v-1',
    ],
  },
};
