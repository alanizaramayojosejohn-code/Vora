import { describe, expect, it } from 'vitest';
import {
  categoryDotClass,
  categoryTextClass,
  destinationBadge,
  elapsedMinutes,
} from './sale-display.model';

describe('elapsedMinutes', () => {
  it('da 0 recién abierta la cuenta', () => {
    const createdAt = '2026-09-08T18:00:00Z';
    expect(elapsedMinutes(createdAt, new Date(createdAt).getTime())).toBe(0);
  });

  it('redondea los minutos transcurridos', () => {
    const createdAt = '2026-09-08T18:00:00Z';
    const now = new Date(createdAt).getTime() + 90_000; // +1.5 min
    expect(elapsedMinutes(createdAt, now)).toBe(2);
  });

  it('nunca da negativo (por ejemplo, con reloj desincronizado)', () => {
    const createdAt = '2026-09-08T18:00:00Z';
    const now = new Date(createdAt).getTime() - 60_000;
    expect(elapsedMinutes(createdAt, now)).toBe(0);
  });
});

describe('destinationBadge', () => {
  it('da "—" para llevar', () => {
    expect(destinationBadge('Para llevar')).toBe('—');
  });

  it('da el número de mesa con dos dígitos', () => {
    expect(destinationBadge('Mesa 7')).toBe('07');
    expect(destinationBadge('Mesa 12')).toBe('12');
  });

  it('da iniciales para un destino sin número', () => {
    expect(destinationBadge('Barra')).toBe('BA');
  });
});

describe('categoryTextClass / categoryDotClass', () => {
  const categories = ['Bebidas', 'Postres', 'Snacks'];

  it('da un color estable por posición en la lista de categorías', () => {
    expect(categoryTextClass('Bebidas', categories)).toBe('text-cat-1');
    expect(categoryTextClass('Postres', categories)).toBe('text-cat-2');
    expect(categoryDotClass('Snacks', categories)).toBe('bg-cat-3');
  });

  it('da un color neutro sin categoría', () => {
    expect(categoryTextClass(null, categories)).toBe('text-foreground-faint');
    expect(categoryTextClass(undefined, categories)).toBe('text-foreground-faint');
  });

  it('da el primer color para una categoría que no está en la lista', () => {
    expect(categoryTextClass('Nueva', categories)).toBe('text-cat-1');
  });
});
