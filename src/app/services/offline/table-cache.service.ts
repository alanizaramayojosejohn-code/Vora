import { inject, Injectable } from '@angular/core';
import { Table } from '../../models/table.model';
import { StorageEncryptionService } from './storage-encryption.service';

interface TableCache {
  saved_at: number;
  tables: Table[];
}

const CACHE_KEY = 'saas_table_cache_v1';
const MAX_AGE_MS = 7 * 24 * 60 * 60 * 1000; // 7 días

// Mismo patrón que ProductCacheService: sin el catálogo de mesas cacheado, el
// selector de mesa queda vacío offline y el cajero no puede abrir una cuenta
// (RF-29). Las altas y bajas de mesas hechas mientras el dispositivo estaba sin
// red aparecen recién en la próxima sincronización.
@Injectable({ providedIn: 'root' })
export class TableCacheService {
  private readonly encryption = inject(StorageEncryptionService);

  save(tables: Table[]): void {
    if (!this.encryption.isReady) return;
    const cache: TableCache = { saved_at: Date.now(), tables };
    this.encryption
      .encrypt(cache)
      .then((encrypted) => localStorage.setItem(CACHE_KEY, encrypted))
      .catch(() => { /* quota exceeded */ });
  }

  async load(): Promise<Table[] | null> {
    try {
      const raw = localStorage.getItem(CACHE_KEY);
      if (!raw || !this.encryption.isReady) return null;
      const cache = await this.encryption.decrypt<TableCache>(raw);
      if (Date.now() - cache.saved_at > MAX_AGE_MS) return null;
      return cache.tables;
    } catch {
      return null;
    }
  }
}
