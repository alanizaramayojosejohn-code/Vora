import { Injectable, signal } from '@angular/core';
import { RegisterOrderInput } from '../order/order.service';

export interface PendingOrder {
  id: string;
  created_at: string;
  input: RegisterOrderInput;
  attempts: number;
  last_error: string | null;
}

const STORAGE_KEY = 'saas_offline_queue_v1';

@Injectable({ providedIn: 'root' })
export class OfflineQueueService {
  readonly pending = signal<PendingOrder[]>(this.loadFromStorage());

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
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(orders));
    } catch { /* quota exceeded — data still available in memory */ }
  }

  private loadFromStorage(): PendingOrder[] {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      return raw ? (JSON.parse(raw) as PendingOrder[]) : [];
    } catch {
      return [];
    }
  }
}
