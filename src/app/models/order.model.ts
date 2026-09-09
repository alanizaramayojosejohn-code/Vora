export type PaymentMethod = 'cash' | 'card' | 'qr';

// 'pending' = la cuenta sigue abierta: se le pueden agregar ítems y todavía no
// entró al arqueo ni a los reportes de ingresos. 'settled' = cobrado.
export type OrderStatus = 'pending' | 'settled';

// Una línea de cobro. El dinero vive acá y no en orders.payment_method: es lo
// único que permite representar un pago dividido, y lo que hace que un
// pendiente (sin líneas) quede naturalmente fuera del arqueo.
export interface OrderPayment {
  id: string;
  order_id: string;
  method: PaymentMethod;
  amount: number;
  cash_session_id: string | null;
  created_at: string;
}

export interface OrderItem {
  id: string;
  order_id: string;
  business_id: string;
  product_id: string | null;
  quantity: number;
  unit_price: number;
  // Costo del producto congelado al momento de vender (spec 002, RF-1):
  // cambiar products.cost después no mueve este número.
  unit_cost: number;
  created_at: string;
}

export interface OrderItemWithDetails extends OrderItem {
  product_name: string | null;
}

// Costo y ganancia bruta de un pedido, sumados desde sus líneas (spec 002,
// RF-6). No lee order.total_amount por costo: cada línea trae el suyo, ya
// congelado, y sumarlas es la única fuente de verdad.
export function orderCost(order: Pick<OrderWithDetails, 'items'>): number {
  return order.items.reduce((sum, i) => sum + Number(i.unit_cost) * i.quantity, 0);
}

export function orderProfit(order: Pick<OrderWithDetails, 'items' | 'total_amount'>): number {
  return Number(order.total_amount) - orderCost(order);
}

export interface Order {
  id: string;
  business_id: string;
  client_id: string | null;
  // Dato heredado: lo llena un cobro de un solo método y queda en null si el
  // pedido está pendiente o se pagó dividido. Para mostrar el método usa
  // orderPaymentLabel(), que lee las líneas.
  payment_method: PaymentMethod | null;
  total_amount: number;
  notes: string | null;
  status: OrderStatus;
  table_id: string | null;
  is_takeaway: boolean;
  settled_at: string | null;
  settled_by: string | null;
  client_uuid: string | null;
  cancelled_at: string | null;
  cancelled_by: string | null;
  cancel_reason: string | null;
  created_by: string | null;
  created_at: string;
}

export interface OrderWithDetails extends Order {
  client_label: string | null;
  table_name: string | null;
  items: OrderItemWithDetails[];
  payments: OrderPayment[];
}

export function orderPrimaryLabel(order: OrderWithDetails): string {
  const first = order.items[0];
  if (!first) return '—';
  const name = first.product_name;
  const extra = order.items.length - 1;
  return extra > 0 ? `${name ?? '—'} (+${extra} más)` : (name ?? '—');
}

// Mesa o "para llevar". Null cuando el pedido no tiene ninguna de las dos: la
// venta de mostrador de siempre, que no necesita etiqueta.
export function orderDestinationLabel(
  order: Pick<OrderWithDetails, 'is_takeaway' | 'table_name'>,
): string | null {
  if (order.table_name) return order.table_name;
  return order.is_takeaway ? 'Para llevar' : null;
}

// Métodos realmente usados, en el orden en que se cobraron y sin repetir.
export function orderPaymentMethods(order: Pick<Order, 'payment_method'> & {
  payments?: OrderPayment[];
}): PaymentMethod[] {
  const fromLines = order.payments?.map((p) => p.method) ?? [];
  const methods = fromLines.length > 0
    ? fromLines
    : order.payment_method ? [order.payment_method] : [];
  return [...new Set(methods)];
}

// RF-14: "Efectivo/QR" en vez de una etiqueta genérica.
export function paymentMethodsLabel(methods: PaymentMethod[]): string {
  if (methods.length === 0) return '—';
  return methods.map((m) => PAYMENT_METHOD_LABEL[m]).join('/');
}

// Un pendiente todavía no tiene líneas, y decir "Efectivo" ahí sería inventar
// un cobro que no ocurrió.
export function orderPaymentLabel(order: Pick<Order, 'payment_method' | 'status'> & {
  payments?: OrderPayment[];
}): string {
  const methods = orderPaymentMethods(order);
  if (methods.length === 0) return order.status === 'pending' ? 'Pendiente' : '—';
  return paymentMethodsLabel(methods);
}

// RF-15 / RF-16: el pendiente lo cobra quien lo abrió, o cualquier admin. El
// servidor lo vuelve a comprobar; acá es para no ofrecer un botón que va a
// fallar.
export function canSettleOrder(
  order: Pick<Order, 'created_by' | 'status' | 'cancelled_at'>,
  userId: string | null,
  role: string | null,
): boolean {
  if (order.status !== 'pending' || order.cancelled_at !== null) return false;
  if (role === 'admin' || role === 'super_admin') return true;
  return userId !== null && order.created_by === userId;
}

// RF-6: una mesa, un pendiente a la vez. Devuelve el pendiente que ya ocupa esa
// mesa para poder ofrecer sumarle los ítems en vez de solo rechazar.
export function findPendingOrderForTable<T extends Pick<Order, 'table_id' | 'status' | 'cancelled_at'>>(
  pendingOrders: T[],
  tableId: string | null,
): T | null {
  if (!tableId) return null;
  return (
    pendingOrders.find(
      (o) => o.table_id === tableId && o.status === 'pending' && o.cancelled_at === null,
    ) ?? null
  );
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
