import { effect, inject, Injectable, signal } from '@angular/core';
import { OrderService } from '../order/order.service';
import { NetworkService } from '../network/network.service';
import { OfflineQueueService, PendingOperation } from './offline-queue.service';
import { errorMessage } from '../../utilities/error-message';
import { errorCode } from '../../utilities/error-code';

export interface SyncError {
  id: string;
  error: string;
}

export interface RejectedOperation {
  id: string;
  message: string;
}

// Errores que no se arreglan reintentando: el pedido ya se cobró o se canceló
// (VORA7), o quien encoló la operación no tiene permiso para cobrarlo (VORA8).
// Reintentarlos para siempre dejaría la cadena de ese pedido trabada y el
// contador de pendientes clavado. Se descartan y se le avisa al cajero
// (RF-26).
const PERMANENT_ERROR_CODES = ['VORA7', 'VORA8'];

@Injectable({ providedIn: 'root' })
export class SyncService {
  private readonly orderService = inject(OrderService);
  private readonly network      = inject(NetworkService);
  private readonly queue        = inject(OfflineQueueService);

  readonly syncing    = signal(false);
  readonly syncErrors = signal<SyncError[]>([]);
  // Operaciones descartadas. No vuelven a intentarse: se muestran hasta que el
  // usuario las cierra.
  readonly rejected   = signal<RejectedOperation[]>([]);

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

    const chains = this.queue.chains();
    if (chains.length === 0) return;

    this.syncing.set(true);
    const errors: SyncError[] = [];

    for (const chain of chains) {
      // La cabecera de la cadena ya se intentó y falló en esta sesión de
      // conexión: todo lo que viene detrás depende de ella, así que el pedido
      // entero espera. Los demás pedidos siguen sincronizando (RF-22).
      if (this.attemptedIds.has(chain[0].id)) continue;

      for (const operation of chain) {
        this.attemptedIds.add(operation.id);
        try {
          await this.apply(operation);
          this.queue.remove(operation.id);
        } catch (err: unknown) {
          const msg = errorMessage(err, 'Error al sincronizar');
          if (PERMANENT_ERROR_CODES.includes(errorCode(err) ?? '')) {
            this.queue.remove(operation.id);
            this.rejected.update((list) => [...list, { id: operation.id, message: msg }]);
          } else {
            this.queue.markAttempt(operation.id, msg);
            errors.push({ id: operation.id, error: msg });
          }
          break;
        }
      }
    }

    this.syncErrors.set(errors);
    this.syncing.set(false);
  }

  private async apply(operation: PendingOperation): Promise<void> {
    switch (operation.kind) {
      case 'create':
        // El order_uuid viaja como clave de idempotencia: si este pedido ya
        // llegó al servidor en un intento anterior cuya respuesta se perdió, el
        // RPC devuelve el existente en vez de duplicarlo.
        await this.orderService.registerOrder(operation.input, operation.order_uuid);
        return;
      case 'add_items':
        await this.orderService.addItems(
          operation.id,
          { uuid: operation.order_uuid, id: null },
          operation.items,
        );
        return;
      case 'settle':
        await this.orderService.settleOrder(
          operation.id,
          { uuid: operation.order_uuid, id: null },
          operation.payments,
          operation.expected_total,
          operation.cash_session_id,
        );
        return;
    }
  }

  retryFailed(): void {
    for (const { id } of this.queue.pending()) {
      this.attemptedIds.delete(id);
    }
    this.syncErrors.set([]);
    void this.syncNow();
  }

  dismissRejected(): void {
    this.rejected.set([]);
  }
}
