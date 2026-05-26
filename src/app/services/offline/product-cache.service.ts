import { Injectable } from '@angular/core';
import { Product } from '../../models/product.model';

interface ProductCache {
  saved_at: number;
  products: Product[];
}

const CACHE_KEY  = 'saas_product_cache_v1';
const MAX_AGE_MS = 7 * 24 * 60 * 60 * 1000; // 7 días

@Injectable({ providedIn: 'root' })
export class ProductCacheService {
  save(products: Product[]): void {
    try {
      const cache: ProductCache = { saved_at: Date.now(), products };
      localStorage.setItem(CACHE_KEY, JSON.stringify(cache));
    } catch { /* quota exceeded */ }
  }

  load(): Product[] | null {
    try {
      const raw = localStorage.getItem(CACHE_KEY);
      if (!raw) return null;
      const cache = JSON.parse(raw) as ProductCache;
      if (Date.now() - cache.saved_at > MAX_AGE_MS) return null;
      return cache.products;
    } catch {
      return null;
    }
  }
}
