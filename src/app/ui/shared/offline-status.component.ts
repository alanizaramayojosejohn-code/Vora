import { ChangeDetectionStrategy, Component, computed, inject } from '@angular/core';
import { NetworkService } from '../../services/network/network.service';
import { OfflineQueueService } from '../../services/offline/offline-queue.service';
import { SyncService } from '../../services/offline/sync.service';

@Component({
  selector: 'app-offline-status',
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: './offline-status.component.html',
})
export class OfflineStatusComponent {
  protected readonly network = inject(NetworkService);
  protected readonly sync    = inject(SyncService);
  protected readonly queue   = inject(OfflineQueueService);

  protected readonly offline      = computed(() => !this.network.isOnline());
  protected readonly syncing      = computed(() => this.sync.syncing());
  protected readonly hasErrors    = computed(() => this.sync.syncErrors().length > 0);
  protected readonly pendingCount = computed(() => this.queue.pending().length);
  protected readonly rejectedOps  = computed(() => this.sync.rejected());
  // Ventas que no se pudieron guardar en este dispositivo (cuota llena o
  // cifrado no listo): tiene prioridad sobre los demás avisos porque acá sí
  // hay riesgo real de perder una venta si el cajero cierra la app.
  protected readonly persistError = computed(() => this.queue.persistError());

  protected readonly firstError = computed(() => {
    const errors = this.sync.syncErrors();
    if (errors.length === 0) return '';
    const extra = errors.length - 1;
    return extra > 0 ? `${errors[0].error} (+${extra} más)` : errors[0].error;
  });
}
