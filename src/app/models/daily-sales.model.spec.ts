import { describe, expect, it } from 'vitest';
import { SalesByPaymentDay, summarizeDailySales } from './daily-sales.model';
import { DailySalesQueryService } from '../services/report/daily-sales.query.service';

function row(
  day: string,
  method: SalesByPaymentDay['payment_method'],
  total: number,
  transactions: number,
): SalesByPaymentDay {
  return { business_id: 'biz-1', day, payment_method: method, total, transactions };
}

describe('summarizeDailySales', () => {
  it('suma totales y transacciones de todos los días del rango', () => {
    const summary = summarizeDailySales([
      row('2026-08-04', 'cash', 100, 4),
      row('2026-08-04', 'qr', 50, 1),
      row('2026-08-03', 'cash', 150, 5),
    ]);

    expect(summary.total).toBe(300);
    expect(summary.transactions).toBe(10);
    expect(summary.byMethod.cash).toBe(250);
    expect(summary.byMethod.qr).toBe(50);
    expect(summary.byMethod.card).toBe(0);
  });

  it('calcula el ticket promedio sobre las transacciones, no sobre las filas', () => {
    // Dos filas (efectivo y QR) pero cinco ventas: dividir por filas daría 100.
    const summary = summarizeDailySales([
      row('2026-08-04', 'cash', 150, 4),
      row('2026-08-04', 'qr', 50, 1),
    ]);

    expect(summary.avgTicket).toBe(40);
  });

  it('no divide por cero cuando no hubo ventas', () => {
    const summary = summarizeDailySales([]);
    expect(summary.total).toBe(0);
    expect(summary.avgTicket).toBe(0);
  });

  it('trata los numeric de Postgres que llegan como string', () => {
    const raw = [{ ...row('2026-08-04', 'cash', 0, 2), total: '120.50' as unknown as number }];
    expect(summarizeDailySales(raw).total).toBe(120.5);
  });
});

describe('DailySalesQueryService.rangeBounds', () => {
  // 20:00 en Bolivia ya es el día siguiente en UTC: si el rango se armara con
  // toISOString(), "Hoy" mostraría mañana durante toda la tarde.
  const evening = new Date(2026, 7, 4, 20, 30, 0);

  it('"Hoy" usa la fecha local, no la UTC', () => {
    expect(DailySalesQueryService.rangeBounds('today', evening)).toEqual({
      from: '2026-08-04',
      to: '2026-08-04',
    });
  });

  it('"Últimos 7 días" incluye hoy y los seis anteriores', () => {
    expect(DailySalesQueryService.rangeBounds('week', evening)).toEqual({
      from: '2026-07-29',
      to: '2026-08-04',
    });
  });

  it('"Últimos 30 días" cruza el cambio de mes sin romperse', () => {
    expect(DailySalesQueryService.rangeBounds('month', evening)).toEqual({
      from: '2026-07-06',
      to: '2026-08-04',
    });
  });
});
