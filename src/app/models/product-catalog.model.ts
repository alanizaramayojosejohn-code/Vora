import { Product } from './product.model';

// Un producto "libre" (has_stock=false) siempre está disponible: no lleva
// control de inventario, así que su stock (a menudo 0) no lo saca del
// catálogo.
export function availableProducts(products: Product[]): Product[] {
  return products.filter((p) => !p.has_stock || p.stock > 0);
}

// Nombres de categoría presentes en el catálogo, sin repetir y ordenados: la
// fila de chips de filtro.
export function catalogCategories(products: Product[]): string[] {
  const set = new Set<string>();
  for (const p of products) {
    if (p.category?.name) set.add(p.category.name);
  }
  return Array.from(set).sort();
}

// Conteo por categoría para el número en cada chip de filtro (rediseño).
export function catalogCategoryCounts(products: Product[]): Record<string, number> {
  const counts: Record<string, number> = {};
  for (const p of products) {
    const name = p.category?.name;
    if (!name) continue;
    counts[name] = (counts[name] ?? 0) + 1;
  }
  return counts;
}

export function filterProducts(
  products: Product[],
  search: string,
  category: string | null,
): Product[] {
  const q = search.toLowerCase().trim();
  return products.filter((p) => {
    if (category && p.category?.name !== category) return false;
    if (q && !p.name.toLowerCase().includes(q)) return false;
    return true;
  });
}

export function totalProductPages(itemCount: number, pageSize: number): number {
  return Math.max(1, Math.ceil(itemCount / pageSize));
}

export function paginateProducts(products: Product[], page: number, pageSize: number): Product[] {
  return products.slice((page - 1) * pageSize, page * pageSize);
}

export function productPageNumbers(totalPages: number): number[] {
  return Array.from({ length: totalPages }, (_, i) => i + 1);
}
