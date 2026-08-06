import { describe, expect, it } from 'vitest';
import { ClientSalesSummary, daysSinceLastPurchase } from './client-sales.model';

function client(lastPurchase: string | null, ordersCount = 3): ClientSalesSummary {
  return {
    business_id: 'biz-1',
    client_id: 'cli-1',
    name: 'Ana',
    ci: '1234567',
    nit: null,
    phone: null,
    orders_count: ordersCount,
    total_spent: 900,
    avg_ticket: 300,
    last_purchase_at: lastPurchase,
    first_purchase_at: '2026-01-01T12:00:00Z',
  };
}

const today = new Date(2026, 7, 4, 12, 0, 0); // 4 de agosto de 2026, mediodía

describe('daysSinceLastPurchase', () => {
  it('devuelve null cuando el cliente nunca compró', () => {
    // Un cliente cargado que nunca compró no es "inactivo hace infinitos días":
    // es otra categoría, y el reporte los separa.
    expect(daysSinceLastPurchase(client(null, 0), today)).toBeNull();
  });

  it('cuenta cero el mismo día de la compra', () => {
    expect(daysSinceLastPurchase(client('2026-08-04T09:00:00'), today)).toBe(0);
  });

  it('cuenta los días transcurridos', () => {
    expect(daysSinceLastPurchase(client('2026-07-05T12:00:00'), today)).toBe(30);
  });
});
