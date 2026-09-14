import { describe, expect, it } from 'vitest';
import {
  cartItemCount,
  CartItem,
  cartQuantityFor,
  cartSubtotal,
  cartTotalQuantity,
  cashChange,
  itemAtMax,
  toRegisterItems,
} from './cart.model';

function item(overrides: Partial<CartItem> = {}): CartItem {
  return {
    product_id: 'prod-1',
    product_name: 'Café',
    category: 'Bebidas',
    unit_price: 15,
    stock_available: 10,
    has_stock: true,
    quantity: 1,
    image_url: null,
    ...overrides,
  };
}

describe('cartSubtotal / cartItemCount / cartTotalQuantity', () => {
  it('da todo en cero para el carrito vacío', () => {
    expect(cartSubtotal([])).toBe(0);
    expect(cartItemCount([])).toBe(0);
    expect(cartTotalQuantity([])).toBe(0);
  });

  it('suma precio * cantidad de cada línea', () => {
    const cart = [item({ unit_price: 15, quantity: 2 }), item({ product_id: 'prod-2', unit_price: 10, quantity: 3 })];
    expect(cartSubtotal(cart)).toBe(15 * 2 + 10 * 3);
  });

  it('cuenta líneas (productos distintos) y cantidad total por separado', () => {
    const cart = [item({ quantity: 2 }), item({ product_id: 'prod-2', quantity: 5 })];
    expect(cartItemCount(cart)).toBe(2);
    expect(cartTotalQuantity(cart)).toBe(7);
  });
});

describe('cashChange', () => {
  it('da el vuelto cuando el recibido cubre el total', () => {
    expect(cashChange(100, 80)).toBe(20);
  });

  it('da negativo cuando el recibido no alcanza (para bloquear el cobro)', () => {
    expect(cashChange(50, 80)).toBe(-30);
  });
});

describe('itemAtMax', () => {
  it('llega al tope cuando la cantidad iguala el stock disponible', () => {
    expect(itemAtMax(item({ has_stock: true, quantity: 10, stock_available: 10 }))).toBe(true);
  });

  it('no llega al tope por debajo del stock disponible', () => {
    expect(itemAtMax(item({ has_stock: true, quantity: 9, stock_available: 10 }))).toBe(false);
  });

  it('un producto sin control de stock nunca llega al tope', () => {
    // has_stock=false es un producto "libre": puede tener cualquier cantidad.
    expect(itemAtMax(item({ has_stock: false, quantity: 999, stock_available: 0 }))).toBe(false);
  });
});

describe('cartQuantityFor', () => {
  it('da 0 para un producto que no está en el carrito', () => {
    expect(cartQuantityFor([], 'prod-1')).toBe(0);
    expect(cartQuantityFor([item({ product_id: 'prod-2' })], 'prod-1')).toBe(0);
  });

  it('da la cantidad del producto que sí está', () => {
    expect(cartQuantityFor([item({ product_id: 'prod-1', quantity: 4 })], 'prod-1')).toBe(4);
  });
});

describe('toRegisterItems', () => {
  it('da el carrito vacío para un carrito vacío', () => {
    expect(toRegisterItems([])).toEqual([]);
  });

  it('se queda solo con product_id, quantity y unit_price', () => {
    const cart = [item({ product_id: 'prod-1', quantity: 3, unit_price: 12 })];
    expect(toRegisterItems(cart)).toEqual([{ product_id: 'prod-1', quantity: 3, unit_price: 12 }]);
  });
});
