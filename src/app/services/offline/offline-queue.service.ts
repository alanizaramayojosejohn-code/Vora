import { inject, Injectable, signal } from '@angular/core';
import { RegisterOrderInput } from '../order/order.service';
import { StorageEncryptionService } from './storage-encryption.service';

export interface PendingOrder {
  id: string;
  created_at: string;
  input: RegisterOrderInput;
  attempts: number;
  last_error: string | null;
}

const STORAGE_KEY = 'saas_offline_queue_v2';

@Injectable({ providedIn: 'root' })
export class OfflineQueueService {
  private readonly encryption = inject(StorageEncryptionService);
  readonly pending = signal<PendingOrder[]>([]);

  async loadFromStorage(): Promise<void> {
    // One-time migration: discard old plaintext data
    localStorage.removeItem('saas_offline_queue_v1');
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      if (!raw) return;
      const orders = await this.encryption.decrypt<PendingOrder[]>(raw);
      this.pending.set(orders);
    } catch {
      localStorage.removeItem(STORAGE_KEY);
    }
  }

  clearStorage(): void {
    localStorage.removeItem(STORAGE_KEY);
    this.pending.set([]);
  }

  enqueue(input: RegisterOrderInput): string {
    const order: PendingOrder = {
      id: crypto.randomUUID(),
      created_at: new Date().toISOString(),
      input,
      attempts: 0,
      last_error: null,
    };
    this.commit([...this.pending(), order]);
    return order.id;
  }

  remove(id: string): void {
    this.commit(this.pending().filter((o) => o.id !== id));
  }

  markAttempt(id: string, error: string | null): void {
    this.commit(
      this.pending().map((o) =>
        o.id === id ? { ...o, attempts: o.attempts + 1, last_error: error } : o,
      ),
    );
  }

  private commit(orders: PendingOrder[]): void {
    this.pending.set(orders);
    if (!this.encryption.isReady) return;
    this.encryption
      .encrypt(orders)
      .then((encrypted) => localStorage.setItem(STORAGE_KEY, encrypted))
      .catch(() => { /* quota exceeded or encryption error */ });
  }
}
