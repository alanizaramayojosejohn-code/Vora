import { describe, expect, it } from 'vitest';
import { Product } from './product.model';
import {
  availableProducts,
  catalogCategories,
  catalogCategoryCounts,
  filterProducts,
  paginateProducts,
  productPageNumbers,
  totalProductPages,
} from './product-catalog.model';

function product(overrides: Partial<Product> = {}): Product {
  return {
    id: `prod-${Math.random()}`,
    business_id: 'biz-1',
    name: 'Café',
    description: null,
    category_id: null,
    category: { id: 'cat-1', name: 'Bebidas', description: null },
    price: 15,
    cost: 5,
    stock: 10,
    has_stock: true,
    provider: null,
    image_url: null,
    created_at: '2026-09-08T18:00:00Z',
    deleted_at: null,
    ...overrides,
  };
}

describe('availableProducts', () => {
  it('deja afuera lo que tiene stock controlado en cero', () => {
    const list = [product({ id: 'a', has_stock: true, stock: 0 }), product({ id: 'b', has_stock: true, stock: 5 })];
    expect(availableProducts(list).map((p) => p.id)).toEqual(['b']);
  });

  it('un producto sin control de stock siempre está disponible, aunque su stock sea 0', () => {
    const list = [product({ id: 'a', has_stock: false, stock: 0 })];
    expect(availableProducts(list)).toHaveLength(1);
  });
});

describe('catalogCategories / catalogCategoryCounts', () => {
  const list = [
    product({ category: { id: 'c1', name: 'Bebidas', description: null } }),
    product({ category: { id: 'c1', name: 'Bebidas', description: null } }),
    product({ category: { id: 'c2', name: 'Postres', description: null } }),
    product({ category: null }),
  ];

  it('da las categorías presentes, sin repetir y ordenadas', () => {
    expect(catalogCategories(list)).toEqual(['Bebidas', 'Postres']);
  });

  it('cuenta cuántos productos hay por categoría', () => {
    expect(catalogCategoryCounts(list)).toEqual({ Bebidas: 2, Postres: 1 });
  });

  it('da listas vacías para un catálogo vacío', () => {
    expect(catalogCategories([])).toEqual([]);
    expect(catalogCategoryCounts([])).toEqual({});
  });
});

describe('filterProducts', () => {
  const list = [
    product({ id: 'a', name: 'Café con leche', category: { id: 'c1', name: 'Bebidas', description: null } }),
    product({ id: 'b', name: 'Torta', category: { id: 'c2', name: 'Postres', description: null } }),
  ];

  it('sin filtros devuelve todo', () => {
    expect(filterProducts(list, '', null)).toHaveLength(2);
  });

  it('filtra por texto de búsqueda, sin importar mayúsculas', () => {
    expect(filterProducts(list, 'CAFÉ', null).map((p) => p.id)).toEqual(['a']);
  });

  it('filtra por categoría activa', () => {
    expect(filterProducts(list, '', 'Postres').map((p) => p.id)).toEqual(['b']);
  });

  it('combina categoría y búsqueda', () => {
    expect(filterProducts(list, 'torta', 'Bebidas')).toEqual([]);
  });
});

describe('totalProductPages / paginateProducts / productPageNumbers', () => {
  const list = Array.from({ length: 45 }, (_, i) => product({ id: `p${i}` }));

  it('siempre da al menos una página, incluso sin productos', () => {
    expect(totalProductPages(0, 20)).toBe(1);
  });

  it('calcula el total de páginas redondeando hacia arriba', () => {
    expect(totalProductPages(45, 20)).toBe(3);
  });

  it('pagina en bloques del tamaño pedido', () => {
    expect(paginateProducts(list, 1, 20)).toHaveLength(20);
    expect(paginateProducts(list, 3, 20)).toHaveLength(5);
  });

  it('da el arreglo de números de página', () => {
    expect(productPageNumbers(3)).toEqual([1, 2, 3]);
  });
});
