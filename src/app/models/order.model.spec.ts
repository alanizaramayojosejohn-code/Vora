import { describe, expect, it } from 'vitest';
import {
  canSettleOrder,
  findPendingOrderForTable,
  Order,
  orderCost,
  OrderItemWithDetails,
  OrderPayment,
  orderPaymentLabel,
  orderProfit,
  OrderStatus,
  PaymentMethod,
} from './order.model';

function item(unitPrice: number, quantity: number, unitCost: number): OrderItemWithDetails {
  return {
    id: `item-${unitPrice}-${quantity}`,
    order_id: 'ord-1',
    business_id: 'biz-1',
    product_id: 'prod-1',
    product_name: 'Café',
    quantity,
    unit_price: unitPrice,
    unit_cost: unitCost,
    created_at: '2026-09-08T18:00:00Z',
  };
}

function order(overrides: Partial<Order> & { payments?: OrderPayment[] } = {}) {
  return {
    id: 'ord-1',
    business_id: 'biz-1',
    client_id: null,
    payment_method: null,
    total_amount: 100,
    notes: null,
    status: 'pending' as OrderStatus,
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
    payments: [],
    ...overrides,
  };
}

function payment(method: PaymentMethod, amount: number, id: string = method): OrderPayment {
  return {
    id,
    order_id: 'ord-1',
    method,
    amount,
    cash_session_id: null,
    created_at: '2026-09-08T19:00:00Z',
  };
}

describe('canSettleOrder', () => {
  it('deja cobrar al cajero que abrió la cuenta', () => {
    expect(canSettleOrder(order(), 'cajero-1', 'caja')).toBe(true);
  });

  it('no deja cobrar a otro cajero', () => {
    // RF-15: el pendiente es responsabilidad de quien lo abrió. El servidor lo
    // rechaza igual, pero acá evita ofrecer un botón que va a fallar.
    expect(canSettleOrder(order(), 'cajero-2', 'caja')).toBe(false);
  });

  it('deja cobrar a un admin cualquier cuenta del negocio', () => {
    // RF-16: el caso real es el cajero que se fue sin cobrar la mesa.
    expect(canSettleOrder(order(), 'admin-1', 'admin')).toBe(true);
  });

  it('no deja cobrar una cuenta ya cobrada ni una cancelada', () => {
    expect(canSettleOrder(order({ status: 'settled' }), 'cajero-1', 'caja')).toBe(false);
    expect(
      canSettleOrder(order({ cancelled_at: '2026-09-08T19:00:00Z' }), 'cajero-1', 'admin'),
    ).toBe(false);
  });

  it('no deja cobrar sin usuario identificado', () => {
    expect(canSettleOrder(order(), null, 'caja')).toBe(false);
  });
});

describe('findPendingOrderForTable', () => {
  const mesa3 = order({ id: 'ord-3', table_id: 'mesa-3' });
  const mesa4 = order({ id: 'ord-4', table_id: 'mesa-4' });

  it('encuentra la cuenta abierta de una mesa ocupada', () => {
    // RF-6: una mesa, un pendiente a la vez. Devolver el pedido —y no solo un
    // booleano— es lo que permite ofrecer sumarle los ítems.
    expect(findPendingOrderForTable([mesa3, mesa4], 'mesa-3')?.id).toBe('ord-3');
  });

  it('devuelve null para una mesa libre', () => {
    expect(findPendingOrderForTable([mesa3], 'mesa-9')).toBeNull();
  });

  it('devuelve null cuando no se eligió mesa', () => {
    // Sin mesa no hay exclusividad que respetar: dos pedidos "para llevar"
    // pueden convivir.
    expect(findPendingOrderForTable([mesa3], null)).toBeNull();
  });

  it('ignora las cuentas ya cobradas o canceladas de esa mesa', () => {
    const cobrada = order({ id: 'ord-5', table_id: 'mesa-3', status: 'settled' });
    const cancelada = order({
      id: 'ord-6', table_id: 'mesa-3', cancelled_at: '2026-09-08T19:00:00Z',
    });
    expect(findPendingOrderForTable([cobrada, cancelada], 'mesa-3')).toBeNull();
  });
});

describe('orderPaymentLabel', () => {
  it('junta con "/" los métodos de un pago dividido', () => {
    // RF-14: la columna dice con qué se pagó de verdad, no una etiqueta
    // genérica tipo "Mixto".
    const dividido = order({
      status: 'settled',
      payments: [payment('cash', 60), payment('qr', 40)],
    });
    expect(orderPaymentLabel(dividido)).toBe('Efectivo/QR');
  });

  it('no repite un método usado en dos líneas', () => {
    const dosEfectivos = order({
      status: 'settled',
      payments: [payment('cash', 60, 'a'), payment('cash', 40, 'b')],
    });
    expect(orderPaymentLabel(dosEfectivos)).toBe('Efectivo');
  });

  it('dice "Pendiente" mientras la cuenta sigue abierta', () => {
    expect(orderPaymentLabel(order())).toBe('Pendiente');
  });

  it('cae en payment_method para las ventas anteriores a las líneas de pago', () => {
    const historica = order({ status: 'settled', payment_method: 'card', payments: [] });
    expect(orderPaymentLabel(historica)).toBe('Tarjeta');
  });
});

describe('orderCost / orderProfit', () => {
  it('suma el costo congelado de cada línea, no el costo actual del producto', () => {
    // El costo viene de item.unit_cost (congelado al vender, spec 002 RF-1):
    // esta función no debe leer products.cost en ningún lado.
    const items = [item(20, 2, 12), item(15, 1, 5)];
    expect(orderCost({ items })).toBe(2 * 12 + 1 * 5);
  });

  it('la ganancia es el total del pedido menos ese costo', () => {
    const items = [item(20, 2, 12), item(15, 1, 5)];
    const total = 20 * 2 + 15 * 1;
    expect(orderProfit({ items, total_amount: total })).toBe(total - (2 * 12 + 1 * 5));
  });

  it('da ganancia negativa cuando el costo supera al precio de venta', () => {
    const items = [item(10, 1, 15)];
    expect(orderProfit({ items, total_amount: 10 })).toBe(-5);
  });

  it('da cero para un pedido sin ítems', () => {
    expect(orderCost({ items: [] })).toBe(0);
    expect(orderProfit({ items: [], total_amount: 0 })).toBe(0);
  });
});
