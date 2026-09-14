import { PendingOperation } from '../services/offline/offline-queue.service';
import { RegisterOrderInput, RegisterProductItem } from '../services/order/order.service';
import {
  canSettleOrder,
  orderDestinationLabel,
  orderPrimaryLabel,
  OrderWithDetails,
  PaymentMethod,
} from './order.model';
import { sumLineTotal } from './cart.model';

// Una cuenta abierta, tal como se ve en la franja de tarjetas (RF-7). Puede
// venir del servidor o de la cola offline de este dispositivo: la pantalla no
// distingue, salvo por la marca de "sin sincronizar".
export interface PendingCard {
  key: string;
  order_uuid: string | null;
  order_id: string | null;
  destination: string;
  total: number;
  summary: string;
  can_settle: boolean;
  synced: boolean;
  table_id: string | null;
  // Para la tarjeta rediseñada ("N ítems · X min"): itemCount ya se cargaba
  // en items.length de cada fuente, createdAt es el created_at de la orden
  // (o de la operación 'create' encolada) y no se pisa con add_items
  // posteriores, para que el tiempo mostrado sea el de apertura de la cuenta.
  itemCount: number;
  createdAt: string;
}

// La cola no guarda el nombre del producto (solo product_id): hace falta el
// catálogo para armar el resumen de una operación 'create'/'add_items'.
function summarizeItems(items: RegisterProductItem[], products: { id: string; name: string }[]): string {
  const first = items[0];
  if (!first) return '—';
  const name = products.find((p) => p.id === first.product_id)?.name ?? 'Producto';
  const extra = items.length - 1;
  return extra > 0 ? `${name} (+${extra} más)` : name;
}

function destinationLabelFor(
  input: RegisterOrderInput,
  tables: { id: string; name: string }[],
): string {
  if (input.table_id) {
    return tables.find((t) => t.id === input.table_id)?.name ?? 'Mesa';
  }
  return input.is_takeaway ? 'Para llevar' : 'Sin mesa';
}

// La franja de cuentas abiertas: lo del servidor más lo que este dispositivo
// encoló y todavía no sincronizó. Sin esta superposición, un pendiente
// creado sin conexión desaparecería de la pantalla hasta volver la señal.
export function buildPendingCards(params: {
  remoteOrders: OrderWithDetails[];
  queue: PendingOperation[];
  products: { id: string; name: string }[];
  tables: { id: string; name: string }[];
  userId: string | null;
  role: string | null;
}): PendingCard[] {
  const { remoteOrders, queue, products, tables, userId, role } = params;
  const cards = new Map<string, PendingCard>();

  for (const order of remoteOrders) {
    const key = order.client_uuid ?? order.id;
    cards.set(key, {
      key,
      order_uuid: order.client_uuid,
      order_id: order.id,
      destination: orderDestinationLabel(order) ?? 'Sin mesa',
      total: Number(order.total_amount),
      summary: orderPrimaryLabel(order),
      can_settle: canSettleOrder(order, userId, role),
      synced: true,
      table_id: order.table_id,
      itemCount: order.items.length,
      createdAt: order.created_at,
    });
  }

  for (const op of queue) {
    if (op.kind === 'create') {
      if (op.input.status !== 'pending') continue;
      cards.set(op.order_uuid, {
        key: op.order_uuid,
        order_uuid: op.order_uuid,
        order_id: null,
        destination: destinationLabelFor(op.input, tables),
        total: sumLineTotal(op.input.items),
        summary: summarizeItems(op.input.items, products),
        can_settle: true,
        synced: false,
        table_id: op.input.table_id ?? null,
        itemCount: op.input.items.length,
        createdAt: op.created_at,
      });
      continue;
    }

    const card = cards.get(op.order_uuid);
    if (!card) continue;

    if (op.kind === 'add_items') {
      cards.set(op.order_uuid, {
        ...card,
        total: card.total + sumLineTotal(op.items),
        itemCount: card.itemCount + op.items.length,
        synced: false,
      });
    } else {
      // Ya está cobrada en este dispositivo: sacarla de la franja evita que
      // se cobre dos veces mientras la operación espera para sincronizar.
      cards.delete(op.order_uuid);
    }
  }

  return [...cards.values()];
}

// Suma de las cuentas abiertas, para el "Pendiente de cobro" de la franja
// (rediseño). No es plata cobrada: es lo que todavía falta cobrar.
export function pendingTotalAmount(cards: PendingCard[]): number {
  return cards.reduce((sum, c) => sum + c.total, 0);
}

export function findActivePending(cards: PendingCard[], activeKey: string | null): PendingCard | null {
  if (!activeKey) return null;
  return cards.find((c) => c.key === activeKey) ?? null;
}

// RF-6: la mesa elegida ya tiene una cuenta abierta. En vez de dejar que el
// servidor rechace la creación, se avisa antes y se ofrece lo que el cajero
// realmente quiere hacer: sumar los productos a esa cuenta.
export function findTableConflict(
  cards: PendingCard[],
  tableId: string | null,
  hasActivePending: boolean,
): PendingCard | null {
  if (hasActivePending) return null;
  if (!tableId) return null;
  return cards.find((c) => c.table_id === tableId) ?? null;
}

export function canChargeCart(params: {
  cartEmpty: boolean;
  submitting: boolean;
  readonlyMode: boolean;
  hasActivePending: boolean;
  splitMode: boolean;
  splitValid: boolean;
  paymentMethod: PaymentMethod;
  cashReceived: number;
  subtotal: number;
}): boolean {
  if (params.cartEmpty) return false;
  if (params.submitting) return false;
  if (params.readonlyMode) return false;
  if (params.hasActivePending) return false;
  if (params.splitMode) return params.splitValid;
  if (params.paymentMethod === 'cash' && params.cashReceived < params.subtotal) return false;
  return true;
}

// Dejar pendiente no exige método de pago (RF-5): todavía no se cobra nada.
export function canLeavePendingCart(params: {
  cartEmpty: boolean;
  submitting: boolean;
  readonlyMode: boolean;
  hasActivePending: boolean;
  hasTableConflict: boolean;
}): boolean {
  if (params.cartEmpty) return false;
  if (params.submitting) return false;
  if (params.readonlyMode) return false;
  if (params.hasActivePending) return false;
  if (params.hasTableConflict) return false;
  return true;
}

export function canAddToPendingCart(params: {
  cartEmpty: boolean;
  submitting: boolean;
  readonlyMode: boolean;
  activePending: PendingCard | null;
  isOnline: boolean;
}): boolean {
  if (params.cartEmpty) return false;
  if (params.submitting) return false;
  if (params.readonlyMode) return false;
  const pending = params.activePending;
  if (!pending) return false;
  // RF-28: sin conexión, sobre un pedido que este dispositivo no puede
  // identificar por uuid no se encola nada a ciegas.
  return pending.order_uuid !== null || params.isOnline;
}
