import { describe, expect, it } from 'vitest';
import { PaymentLine, remainingAmount, validatePaymentSplit } from './payment-split.model';

const cash = (amount: number): PaymentLine => ({ method: 'cash', amount });
const qr = (amount: number): PaymentLine => ({ method: 'qr', amount });

describe('validatePaymentSplit', () => {
  it('acepta un reparto que da exacto', () => {
    const check = validatePaymentSplit([cash(50), qr(30)], 80);
    expect(check.valid).toBe(true);
    expect(check.error).toBeNull();
    expect(check.difference).toBe(0);
  });

  it('rechaza un reparto que no llega al total e informa cuánto falta', () => {
    const check = validatePaymentSplit([cash(50), qr(20)], 80);
    expect(check.valid).toBe(false);
    expect(check.difference).toBe(10);
    expect(check.error).toContain('10.00');
  });

  it('rechaza un reparto que se pasa del total', () => {
    const check = validatePaymentSplit([cash(50), qr(40)], 80);
    expect(check.valid).toBe(false);
    expect(check.difference).toBe(-10);
    expect(check.error).toContain('10.00');
  });

  it('acepta decimales que en coma flotante no suman exacto', () => {
    // 0.1 + 0.2 da 0.30000000000000004 en JS. Si la validación comparara
    // flotantes, este reparto —que es correcto— quedaría rechazado y el cajero
    // no podría cobrar.
    expect(validatePaymentSplit([cash(0.1), qr(0.2)], 0.3).valid).toBe(true);
  });

  it('rechaza líneas en cero o negativas', () => {
    expect(validatePaymentSplit([cash(80), qr(0)], 80).valid).toBe(false);
    expect(validatePaymentSplit([cash(90), qr(-10)], 80).valid).toBe(false);
  });

  it('exige al menos una línea cuando hay algo que cobrar', () => {
    const check = validatePaymentSplit([], 80);
    expect(check.valid).toBe(false);
    expect(check.error).toContain('al menos una línea');
  });

  it('acepta un pedido en cero sin líneas de pago', () => {
    expect(validatePaymentSplit([], 0).valid).toBe(true);
  });

  it('un pago simple es un reparto de una sola línea', () => {
    expect(validatePaymentSplit([cash(80)], 80).valid).toBe(true);
  });
});

describe('remainingAmount', () => {
  it('devuelve lo que falta para completar el total', () => {
    expect(remainingAmount([cash(50)], 80)).toBe(30);
  });

  it('no devuelve negativos cuando el reparto ya se pasó', () => {
    expect(remainingAmount([cash(100)], 80)).toBe(0);
  });
});
