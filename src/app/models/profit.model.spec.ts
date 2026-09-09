import { describe, expect, it } from 'vitest';
import { computeMargin, netProfitAfterPayroll, sumProfitTotals } from './profit.model';

describe('computeMargin', () => {
  it('calcula el margen como porcentaje del ingreso', () => {
    expect(computeMargin(30, 100)).toBe(30);
  });

  it('devuelve null cuando el ingreso es cero, no 0%', () => {
    // Un margen de "0%" diría que no hubo ni ganancia ni pérdida; acá no hay
    // ingreso sobre el que calcular ningún porcentaje — son cosas distintas
    // (spec 002, RF-10).
    expect(computeMargin(0, 0)).toBeNull();
    expect(computeMargin(-5, 0)).toBeNull();
  });

  it('devuelve un margen negativo cuando el costo superó al precio', () => {
    // Vender por debajo del costo es justo lo que este reporte tiene que
    // dejar ver, no ocultar recortando a cero.
    expect(computeMargin(-20, 100)).toBe(-20);
  });

  it('acepta un margen de exactamente 0% como valor real', () => {
    // Ingreso = costo: la ganancia es cero pero el margen SÍ es calculable
    // (a diferencia del caso de ingreso cero) y debe distinguirse de null.
    expect(computeMargin(0, 100)).toBe(0);
  });
});

describe('sumProfitTotals', () => {
  it('suma ingreso, costo y ganancia de varias filas', () => {
    const total = sumProfitTotals([
      { revenue: 100, cost: 60, profit: 40 },
      { revenue: 50, cost: 40, profit: 10 },
    ]);
    expect(total).toEqual({ revenue: 150, cost: 100, profit: 50 });
  });

  it('devuelve ceros para una lista vacía', () => {
    expect(sumProfitTotals([])).toEqual({ revenue: 0, cost: 0, profit: 0 });
  });
});

describe('netProfitAfterPayroll', () => {
  it('resta los sueldos del mes de la ganancia bruta', () => {
    expect(netProfitAfterPayroll(1000, 300)).toBe(700);
  });

  it('devuelve null cuando el negocio no registró sueldos ese mes', () => {
    // RF-16: sin sueldos, el reporte muestra solo la ganancia bruta —
    // distinguir "no hay sueldos" (null) de "hay sueldos en 0" evita una
    // fila de "utilidad" idéntica a la bruta que no aporta nada.
    expect(netProfitAfterPayroll(1000, null)).toBeNull();
  });

  it('puede dar negativo si los sueldos superan la ganancia', () => {
    expect(netProfitAfterPayroll(200, 500)).toBe(-300);
  });
});
