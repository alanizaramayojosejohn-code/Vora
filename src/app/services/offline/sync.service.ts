import { effect, inject, Injectable, signal } from '@angular/core';
import { OrderService } from '../order/order.service';
import { NetworkService } from '../network/network.service';
import { OfflineQueueService } from './offline-queue.service';
import { errorMessage } from '../../utilities/error-message';

export interface SyncError {
  id: string;
  error: string;
}

@Injectable({ providedIn: 'root' })
export class SyncService {
  private readonly orderService = inject(OrderService);
  private readonly network      = inject(NetworkService);
  private readonly queue        = inject(OfflineQueueService);

  readonly syncing    = signal(false);
  readonly syncErrors = signal<SyncError[]>([]);

  // IDs ya intentados en la sesión de conexión actual.
  // Se limpia al reconectar para dar una nueva oportunidad automática.
  private readonly attemptedIds = new Set<string>();
  private prevOnline = typeof navigator !== 'undefined' ? navigator.onLine : true;

  constructor() {
    effect(() => {
      const online  = this.network.isOnline();
      const pending = this.queue.pending();

      // Al reconectar: limpiar intentos previos para reintentar todo
      if (online && !this.prevOnline) {
        this.attemptedIds.clear();
        this.syncErrors.set([]);
      }
      this.prevOnline = online;

      if (online && !this.syncing() && pending.length > 0) {
        const unAttempted = pending.filter((o) => !this.attemptedIds.has(o.id));
        if (unAttempted.length > 0) void this.syncNow();
      }
    });
  }

  async syncNow(): Promise<void> {
    if (this.syncing() || !this.network.isOnline()) return;

    const toSync = this.queue.pending().filter((o) => !this.attemptedIds.has(o.id));
    if (toSync.length === 0) return;

    this.syncing.set(true);
    const errors: SyncError[] = [];

    for (const order of toSync) {
      this.attemptedIds.add(order.id);
      try {
        // El id de la cola viaja como clave de idempotencia: si esta venta ya
        // llegó al servidor en un intento anterior cuya respuesta se perdió,
        // el RPC devuelve la orden existente en vez de duplicarla.
        await this.orderService.registerOrder(order.input, order.id);
        this.queue.remove(order.id);
      } catch (err: unknown) {
        const msg = errorMessage(err, 'Error al sincronizar venta');
        this.queue.markAttempt(order.id, msg);
        errors.push({ id: order.id, error: msg });
      }
    }

    this.syncErrors.set(errors);
    this.syncing.set(false);
  }

  retryFailed(): void {
    for (const { id } of this.queue.pending()) {
      this.attemptedIds.delete(id);
    }
    this.syncErrors.set([]);
    void this.syncNow();
  }
}
