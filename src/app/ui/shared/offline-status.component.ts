import { ChangeDetectionStrategy, Component, computed, inject } from '@angular/core';
import { NetworkService } from '../../services/network/network.service';
import { OfflineQueueService } from '../../services/offline/offline-queue.service';
import { SyncService } from '../../services/offline/sync.service';

@Component({
  selector: 'app-offline-status',
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    @if (syncing()) {
      <div class="flex items-center gap-2.5 px-4 py-2.5 bg-primary/10 border-b border-primary/20 text-primary text-sm font-medium">
        <svg class="animate-spin flex-shrink-0" xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round">
          <path d="M21 12a9 9 0 1 1-6.219-8.56"/>
        </svg>
        Sincronizando {{ pendingCount() }} {{ pendingCount() === 1 ? 'venta' : 'ventas' }} pendiente{{ pendingCount() === 1 ? '' : 's' }}…
      </div>
    } @else if (hasErrors()) {
      <div class="flex items-center gap-2.5 px-4 py-2.5 bg-danger/8 border-b border-danger/20 text-danger text-sm font-medium">
        <svg class="flex-shrink-0" xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round">
          <circle cx="12" cy="12" r="10"/><line x1="12" x2="12" y1="8" y2="12"/><line x1="12" x2="12.01" y1="16" y2="16"/>
        </svg>
        <span class="flex-1 min-w-0">{{ errorCount() }} {{ errorCount() === 1 ? 'venta no pudo' : 'ventas no pudieron' }} sincronizarse</span>
        <button (click)="sync.retryFailed()"
                class="text-xs font-semibold underline underline-offset-2 hover:no-underline flex-shrink-0">
          Reintentar
        </button>
      </div>
    } @else if (offline()) {
      <div class="flex items-center gap-2.5 px-4 py-2.5 bg-warning/10 border-b border-warning/20 text-warning text-sm font-medium">
        <svg class="flex-shrink-0" xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round">
          <line x1="2" x2="22" y1="2" y2="22"/><path d="M8.5 16.5a5 5 0 0 1 7 0"/><path d="M2 8.82a15 15 0 0 1 4.17-2.65"/><path d="M10.66 5c4.01-.36 8.14.9 11.34 3.76"/><path d="M16.85 11.25a10 10 0 0 1 2.22 1.68"/><path d="M5 12.85A10 10 0 0 1 10 10"/>
          <line x1="12" x2="12.01" y1="20" y2="20"/>
        </svg>
        Sin conexión
        @if (pendingCount() > 0) {
          <span class="text-foreground-muted font-normal">·</span>
          <span class="text-foreground-muted font-normal">{{ pendingCount() }} {{ pendingCount() === 1 ? 'venta en cola' : 'ventas en cola' }}</span>
        }
      </div>
    } @else if (pendingCount() > 0) {
      <div class="flex items-center gap-2.5 px-4 py-2.5 bg-warning/10 border-b border-warning/20 text-warning text-sm font-medium">
        <svg class="flex-shrink-0" xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round">
          <circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 16 14"/>
        </svg>
        {{ pendingCount() }} {{ pendingCount() === 1 ? 'venta pendiente' : 'ventas pendientes' }} de sincronizar
      </div>
    }
  `,
})
export class OfflineStatusComponent {
  protected readonly network = inject(NetworkService);
  protected readonly sync    = inject(SyncService);
  protected readonly queue   = inject(OfflineQueueService);

  protected readonly offline      = computed(() => !this.network.isOnline());
  protected readonly syncing      = computed(() => this.sync.syncing());
  protected readonly hasErrors    = computed(() => this.sync.syncErrors().length > 0);
  protected readonly errorCount   = computed(() => this.sync.syncErrors().length);
  protected readonly pendingCount = computed(() => this.queue.pending().length);
}
