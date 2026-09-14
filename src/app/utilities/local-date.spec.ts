import { describe, expect, it } from 'vitest';
import { localDate, localMonthStart } from './local-date';

describe('localDate', () => {
  it('devuelve el día en formato YYYY-MM-DD', () => {
    expect(localDate(new Date(2026, 8, 13))).toBe('2026-09-13');
  });

  it('rellena con ceros mes y día de un dígito', () => {
    expect(localDate(new Date(2026, 0, 5))).toBe('2026-01-05');
  });

  it('no adelanta un día a la tarde en un huso UTC-4 (caso del bug real)', () => {
    // A las 20:00 hora local, toISOString() ya cruzó la medianoche UTC y
    // devolvería el día siguiente. localDate debe seguir devolviendo el
    // mismo día calendario que ve el usuario en Bolivia.
    const monday2000 = new Date(2026, 8, 14, 20, 0, 0);
    expect(localDate(monday2000)).toBe('2026-09-14');
    expect(monday2000.toISOString().slice(0, 10)).toBe('2026-09-15');
  });

  it('funciona igual cerca de medianoche local', () => {
    expect(localDate(new Date(2026, 8, 30, 23, 59, 59))).toBe('2026-09-30');
  });
});

describe('localMonthStart', () => {
  it('devuelve el primer día del mes en formato YYYY-MM-01', () => {
    expect(localMonthStart(new Date(2026, 8, 13))).toBe('2026-09-01');
  });

  it('no adelanta de mes a la tarde del último día (caso del bug real)', () => {
    // Último día del mes, a la tarde: toISOString() ya cayó en el mes
    // siguiente en UTC, pero localMonthStart debe seguir viendo septiembre.
    const lastDayEvening = new Date(2026, 8, 30, 22, 0, 0);
    expect(localMonthStart(lastDayEvening)).toBe('2026-09-01');
    expect(lastDayEvening.toISOString().slice(0, 7)).toBe('2026-10');
  });

  it('rellena con cero el mes de un dígito', () => {
    expect(localMonthStart(new Date(2026, 0, 15))).toBe('2026-01-01');
  });
});
