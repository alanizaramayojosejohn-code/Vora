import { inject, Injectable } from '@angular/core';
import { Product } from '../../models/product.model';
import { StorageEncryptionService } from './storage-encryption.service';

interface ProductCache {
  saved_at: number;
  products: Product[];
}

const CACHE_KEY = 'saas_product_cache_v2';
const MAX_AGE_MS = 7 * 24 * 60 * 60 * 1000; // 7 días

@Injectable({ providedIn: 'root' })
export class ProductCacheService {
  private readonly encryption = inject(StorageEncryptionService);

  save(products: Product[]): void {
    if (!this.encryption.isReady) return;
    // One-time migration: discard old plaintext data
    localStorage.removeItem('saas_product_cache_v1');
    const cache: ProductCache = { saved_at: Date.now(), products };
    this.encryption
      .encrypt(cache)
      .then((encrypted) => localStorage.setItem(CACHE_KEY, encrypted))
      .catch(() => { /* quota exceeded */ });
  }

  async load(): Promise<Product[] | null> {
    try {
      const raw = localStorage.getItem(CACHE_KEY);
      if (!raw || !this.encryption.isReady) return null;
      const cache = await this.encryption.decrypt<ProductCache>(raw);
      if (Date.now() - cache.saved_at > MAX_AGE_MS) return null;
      return cache.products;
    } catch {
      return null;
    }
  }
}
