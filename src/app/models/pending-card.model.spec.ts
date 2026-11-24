import { describe, expect, it } from 'vitest';
import { AddItemsOperation, CreateOperation, SettleOperation } from '../services/offline/offline-queue.service';
import { RegisterOrderInput } from '../services/order/order.service';
import { OrderWithDetails } from './order.model';
import {
  buildPendingCards,
  canAddToPendingCart,
  canChargeCart,
  canLeavePendingCart,
  findActivePending,
  findTableConflict,
  pendingTotalAmount,
} from './pending-card.model';

function remoteOrder(overrides: Partial<OrderWithDetails> = {}): OrderWithDetails {
  return {
    id: 'ord-1',
    business_id: 'biz-1',
    client_id: null,
    payment_method: null,
    total_amount: 100,
    notes: null,
    status: 'pending',
    table_id: null,
    is_takeaway: false,
    settled_at: null,
    settled_by: null,
    client_uuid: 'uuid-1',
    cancelled_at: null,
    cancelled_by: null,
    cancel_reason: null,
    created_by: 'cajero-1',
    created_at: '2026-09-08T18:00:00Z',
    client_label: null,
    table_name: null,
    items: [
      {
        id: 'item-1', order_id: 'ord-1', business_id: 'biz-1', product_id: 'prod-1',
        product_name: 'Café', quantity: 2, unit_price: 15, unit_cost: 5,
        created_at: '2026-09-08T18:00:00Z',
      },
    ],
    payments: [],
    ...overrides,
  };
}

function createOp(input: Partial<RegisterOrderInput> = {}, overrides: Partial<CreateOperation> = {}): CreateOperation {
  return {
    id: 'op-create-1',
    order_uuid: 'local-uuid-1',
    created_at: '2026-09-08T19:00:00Z',
    attempts: 0,
    last_error: null,
    kind: 'create',
    input: {
      client_id: null,
      payment_method: null,
      status: 'pending',
      items: [{ product_id: 'prod-1', quantity: 1, unit_price: 20 }],
      ...input,
    },
    ...overrides,
  };
}

function addItemsOp(overrides: Partial<AddItemsOperation> = {}): AddItemsOperation {
  return {
    id: 'op-add-1',
    order_uuid: 'local-uuid-1',
    created_at: '2026-09-08T19:05:00Z',
    attempts: 0,
    last_error: null,
    kind: 'add_items',
    items: [{ product_id: 'prod-2', quantity: 1, unit_price: 5 }],
    ...overrides,
  };
}

function settleOp(overrides: Partial<SettleOperation> = {}): SettleOperation {
  return {
    id: 'op-settle-1',
    order_uuid: 'local-uuid-1',
    created_at: '2026-09-08T19:10:00Z',
    attempts: 0,
    last_error: null,
    kind: 'settle',
    payments: [{ method: 'cash', amount: 20 }],
    expected_total: 20,
    cash_session_id: null,
    ...overrides,
  };
}

const products = [{ id: 'prod-1', name: 'Café' }, { id: 'prod-2', name: 'Medialuna' }];
const tables = [{ id: 'mesa-3', name: 'Mesa 3' }];

describe('buildPendingCards', () => {
  it('da una lista vacía sin cuentas remotas ni operaciones en cola', () => {
    expect(buildPendingCards({ remoteOrders: [], queue: [], products, tables, userId: null, role: null })).toEqual([]);
  });

  it('arma una tarjeta por cada cuenta remota', () => {
    const cards = buildPendingCards({
      remoteOrders: [remoteOrder()], queue: [], products, tables, userId: 'cajero-1', role: 'caja',
    });
    expect(cards).toHaveLength(1);
    expect(cards[0]).toMatchObject({ key: 'uuid-1', synced: true, total: 100, itemCount: 1 });
  });

  it('un pendiente "para llevar" sin mesa se etiqueta como tal', () => {
    const cards = buildPendingCards({
      remoteOrders: [], queue: [createOp({ is_takeaway: true, table_id: undefined })],
      products, tables, userId: null, role: null,
    });
    expect(cards[0].destination).toBe('Para llevar');
  });

  it('un pendiente sin mesa y sin "para llevar" se etiqueta "Sin mesa"', () => {
    const cards = buildPendingCards({
      remoteOrders: [], queue: [createOp()], products, tables, userId: null, role: null,
    });
    expect(cards[0].destination).toBe('Sin mesa');
  });

  it('una operación create encolada aparece como tarjeta no sincronizada', () => {
    const cards = buildPendingCards({
      remoteOrders: [], queue: [createOp({ table_id: 'mesa-3', items: [{ product_id: 'prod-1', quantity: 2, unit_price: 15 }] })],
      products, tables, userId: null, role: null,
    });
    expect(cards).toHaveLength(1);
    expect(cards[0]).toMatchObject({
      synced: false, destination: 'Mesa 3', total: 30, itemCount: 1, table_id: 'mesa-3',
    });
  });

  it('ignora una create encolada que ya nació cobrada (no es un pendiente)', () => {
    const cards = buildPendingCards({
      remoteOrders: [], queue: [createOp({ status: 'settled' })], products, tables, userId: null, role: null,
    });
    expect(cards).toEqual([]);
  });

  it('add_items acumula total e itemCount sobre la tarjeta creada antes', () => {
    const cards = buildPendingCards({
      remoteOrders: [],
      queue: [
        createOp({ items: [{ product_id: 'prod-1', quantity: 1, unit_price: 20 }] }),
        addItemsOp({ items: [{ product_id: 'prod-2', quantity: 2, unit_price: 5 }] }),
      ],
      products, tables, userId: null, role: null,
    });
    expect(cards).toHaveLength(1);
    expect(cards[0]).toMatchObject({ total: 20 + 10, itemCount: 2, synced: false });
  });

  it('add_items sobre una cuenta que no existe en el mapa no rompe nada', () => {
    const cards = buildPendingCards({
      remoteOrders: [], queue: [addItemsOp({ order_uuid: 'no-existe' })], products, tables, userId: null, role: null,
    });
    expect(cards).toEqual([]);
  });

  it('settle saca la tarjeta de la franja (ya está cobrada en este dispositivo)', () => {
    const cards = buildPendingCards({
      remoteOrders: [], queue: [createOp(), settleOp()], products, tables, userId: null, role: null,
    });
    expect(cards).toEqual([]);
  });
});

describe('pendingTotalAmount', () => {
  it('da 0 sin cuentas abiertas', () => {
    expect(pendingTotalAmount([])).toBe(0);
  });

  it('suma el total de todas las tarjetas', () => {
    const cards = buildPendingCards({
      remoteOrders: [remoteOrder({ id: 'a', client_uuid: 'a', total_amount: 40 }), remoteOrder({ id: 'b', client_uuid: 'b', total_amount: 60 })],
      queue: [], products, tables, userId: null, role: null,
    });
    expect(pendingTotalAmount(cards)).toBe(100);
  });
});

describe('findActivePending / findTableConflict', () => {
  const cards = buildPendingCards({
    remoteOrders: [remoteOrder({ table_id: 'mesa-3' })], queue: [], products, tables, userId: null, role: null,
  });

  it('findActivePending da null sin clave activa', () => {
    expect(findActivePending(cards, null)).toBeNull();
  });

  it('findActivePending encuentra la tarjeta por su clave', () => {
    expect(findActivePending(cards, 'uuid-1')?.key).toBe('uuid-1');
  });

  it('findTableConflict detecta que la mesa elegida ya tiene cuenta abierta', () => {
    expect(findTableConflict(cards, 'mesa-3', false)?.table_id).toBe('mesa-3');
  });

  it('findTableConflict no avisa si ya hay una cuenta activa seleccionada', () => {
    // Si ya se está sumando a un pendiente, no tiene sentido advertir conflicto.
    expect(findTableConflict(cards, 'mesa-3', true)).toBeNull();
  });

  it('findTableConflict da null sin mesa elegida', () => {
    expect(findTableConflict(cards, null, false)).toBeNull();
  });

  it('findTableConflict da null para una mesa libre', () => {
    expect(findTableConflict(cards, 'mesa-9', false)).toBeNull();
  });
});

describe('canChargeCart', () => {
  const base = {
    cartEmpty: false, submitting: false, readonlyMode: false, hasActivePending: false,
    splitMode: false, splitValid: true, paymentMethod: 'cash' as const, cashReceived: 100, subtotal: 80,
  };

  it('no deja cobrar el carrito vacío', () => {
    expect(canChargeCart({ ...base, cartEmpty: true })).toBe(false);
  });

  it('no deja cobrar mientras se está enviando, sin turno válido, o sobre un pendiente activo', () => {
    expect(canChargeCart({ ...base, submitting: true })).toBe(false);
    expect(canChargeCart({ ...base, readonlyMode: true })).toBe(false);
    expect(canChargeCart({ ...base, hasActivePending: true })).toBe(false);
  });

  it('con pago dividido, depende solo de si el reparto es válido', () => {
    expect(canChargeCart({ ...base, splitMode: true, splitValid: true })).toBe(true);
    expect(canChargeCart({ ...base, splitMode: true, splitValid: false })).toBe(false);
  });

  it('en efectivo, exige que lo recibido cubra el subtotal', () => {
    expect(canChargeCart({ ...base, paymentMethod: 'cash', cashReceived: 50, subtotal: 80 })).toBe(false);
    expect(canChargeCart({ ...base, paymentMethod: 'cash', cashReceived: 80, subtotal: 80 })).toBe(true);
  });

  it('con tarjeta o QR no exige monto recibido', () => {
    expect(canChargeCart({ ...base, paymentMethod: 'card', cashReceived: 0 })).toBe(true);
  });
});

describe('canLeavePendingCart', () => {
  const base = {
    cartEmpty: false, submitting: false, readonlyMode: false, hasActivePending: false, hasTableConflict: false,
  };

  it('no deja dejar pendiente el carrito vacío', () => {
    expect(canLeavePendingCart({ ...base, cartEmpty: true })).toBe(false);
  });

  it('no exige método de pago: alcanza con las condiciones generales', () => {
    expect(canLeavePendingCart(base)).toBe(true);
  });

  it('no deja si hay conflicto de mesa sin resolver', () => {
    expect(canLeavePendingCart({ ...base, hasTableConflict: true })).toBe(false);
  });

  it('no deja si ya se está sumando a un pendiente activo', () => {
    expect(canLeavePendingCart({ ...base, hasActivePending: true })).toBe(false);
  });
});

describe('canAddToPendingCart', () => {
  const card = {
    key: 'k', order_uuid: 'uuid-1', order_id: null, destination: 'Mesa 3', total: 0,
    summary: '—', can_settle: true, synced: true, table_id: 'mesa-3', itemCount: 0, createdAt: '2026-09-08T18:00:00Z',
  };
  const base = { cartEmpty: false, submitting: false, readonlyMode: false, activePending: card, isOnline: true };

  it('no deja agregar sin un pendiente activo', () => {
    expect(canAddToPendingCart({ ...base, activePending: null })).toBe(false);
  });

  it('no deja agregar con el carrito vacío', () => {
    expect(canAddToPendingCart({ ...base, cartEmpty: true })).toBe(false);
  });

  it('con order_uuid conocido, deja agregar sin conexión', () => {
    expect(canAddToPendingCart({ ...base, isOnline: false })).toBe(true);
  });

  it('sin order_uuid (pendiente de otro dispositivo) exige conexión', () => {
    // RF-28: no se encola a ciegas sobre un pedido que este dispositivo no
    // puede identificar por uuid.
    expect(canAddToPendingCart({ ...base, activePending: { ...card, order_uuid: null }, isOnline: false })).toBe(false);
    expect(canAddToPendingCart({ ...base, activePending: { ...card, order_uuid: null }, isOnline: true })).toBe(true);
  });
});
