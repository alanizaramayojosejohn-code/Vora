import { describe, expect, it } from 'vitest';
import {
  BusinessSubscription,
  evaluateSubscription,
  SUBSCRIPTION_GRACE_DAYS,
} from './subscription.model';

function sub(endDate: string, status: BusinessSubscription['status'] = 'active'): BusinessSubscription {
  return {
    id: 'sub-1',
    business_id: 'biz-1',
    plan_type: 'negocio',
    monthly_fee: 349,
    start_date: '2026-01-01',
    end_date: endDate,
    status,
    created_at: '2026-01-01T00:00:00Z',
  };
}

// Mediodía local: evita que el propio caso de prueba cruce un día por el huso.
const today = new Date(2026, 7, 2, 12, 0, 0); // 2 de agosto de 2026

describe('evaluateSubscription', () => {
  it('no vence el mismo día de end_date', () => {
    // Regresión: parsear 'YYYY-MM-DD' como UTC hacía que en Bolivia (UTC-4)
    // la suscripción venciera un día antes de tiempo.
    const s = evaluateSubscription(sub('2026-08-02'), today);
    expect(s.daysUntilExpiry).toBe(0);
    expect(s.isExpired).toBe(false);
    expect(s.isBlocked).toBe(false);
  });

  it('marca vencimiento próximo dentro de los 5 días', () => {
    const s = evaluateSubscription(sub('2026-08-06'), today);
    expect(s.daysUntilExpiry).toBe(4);
    expect(s.isExpiringSoon).toBe(true);
    expect(s.isExpired).toBe(false);
  });

  it('no marca como próximo un vencimiento lejano', () => {
    expect(evaluateSubscription(sub('2026-09-15'), today).isExpiringSoon).toBe(false);
  });

  it('vencida pero dentro de la gracia: no bloquea', () => {
    const s = evaluateSubscription(sub('2026-07-28'), today); // venció hace 5 días
    expect(s.daysUntilExpiry).toBe(-SUBSCRIPTION_GRACE_DAYS);
    expect(s.isExpired).toBe(true);
    expect(s.isBlocked).toBe(false);
  });

  it('bloquea al agotarse la gracia', () => {
    const s = evaluateSubscription(sub('2026-07-27'), today); // venció hace 6 días
    expect(s.isExpired).toBe(true);
    expect(s.isBlocked).toBe(true);
  });

  it('una suscripción cancelada bloquea aunque no haya vencido', () => {
    const s = evaluateSubscription(sub('2026-12-31', 'cancelled'), today);
    expect(s.isExpired).toBe(false);
    expect(s.isBlocked).toBe(true);
  });
});
