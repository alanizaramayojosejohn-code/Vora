import { ChangeDetectionStrategy, Component, computed, inject, OnInit } from '@angular/core';
import { SUBSCRIPTION_GRACE_DAYS } from '../../models/subscription.model';
import { SubscriptionStateService } from '../../services/subscription/subscription-state.service';

// Aviso de vencimiento próximo o de gracia en curso. Se muestra en admin y
// caja para que el corte nunca llegue de sorpresa.
@Component({
  selector: 'app-subscription-status',
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    @if (blocked()) {
      <div class="flex items-center gap-2.5 px-4 py-2.5 bg-danger/12 border-b border-danger/25 text-danger text-sm font-medium">
        <svg class="flex-shrink-0" xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round">
          <rect width="18" height="11" x="3" y="11" rx="2"/><path d="M7 11V7a5 5 0 0 1 10 0v4"/>
        </svg>
        <span class="flex-1 min-w-0">
          Modo solo lectura — suscripción vencida.
          <span class="font-normal">Puedes consultar todo, pero no registrar ventas ni hacer cambios hasta regularizar el pago.</span>
        </span>
      </div>
    } @else if (inGrace()) {
      <div class="flex items-center gap-2.5 px-4 py-2.5 bg-danger/8 border-b border-danger/20 text-danger text-sm font-medium">
        <svg class="flex-shrink-0" xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round">
          <circle cx="12" cy="12" r="10"/><line x1="12" x2="12" y1="8" y2="12"/><line x1="12" x2="12.01" y1="16" y2="16"/>
        </svg>
        Suscripción vencida.
        @if (daysLeft() > 0) {
          <span class="font-normal">El sistema se bloquea en {{ daysLeft() }} {{ daysLeft() === 1 ? 'día' : 'días' }}.</span>
        } @else {
          <span class="font-normal">El sistema se bloquea hoy.</span>
        }
      </div>
    } @else if (expiringSoon()) {
      <div class="flex items-center gap-2.5 px-4 py-2.5 bg-warning/10 border-b border-warning/20 text-warning text-sm font-medium">
        <svg class="flex-shrink-0" xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round">
          <circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 16 14"/>
        </svg>
        @if (days() === 0) {
          Tu suscripción vence hoy.
        } @else {
          Tu suscripción vence en {{ days() }} {{ days() === 1 ? 'día' : 'días' }}.
        }
      </div>
    }
  `,
})
export class SubscriptionStatusComponent implements OnInit {
  private readonly state = inject(SubscriptionStateService);

  private readonly status = computed(() => this.state.status());

  protected readonly days          = computed(() => this.status()?.daysUntilExpiry ?? 0);
  protected readonly expiringSoon  = computed(() => this.status()?.isExpiringSoon ?? false);
  protected readonly blocked       = computed(() => this.status()?.isBlocked ?? false);
  protected readonly inGrace       = computed(() => {
    const s = this.status();
    return !!s && s.isExpired && !s.isBlocked;
  });
  // Días que quedan de gracia antes del corte. `daysUntilExpiry` es negativo
  // acá: en -1 (venció ayer) quedan los 5 días completos; en -5, solo hoy.
  protected readonly daysLeft = computed(() => {
    const s = this.status();
    return s ? Math.max(0, SUBSCRIPTION_GRACE_DAYS + s.daysUntilExpiry + 1) : 0;
  });

  ngOnInit(): void {
    void this.state.ensureLoaded();
  }
}
