import { ChangeDetectionStrategy, Component, computed, inject, OnInit } from '@angular/core';
import { SUBSCRIPTION_GRACE_DAYS } from '../../models/subscription.model';
import { SubscriptionStateService } from '../../services/subscription/subscription-state.service';

// Aviso de vencimiento próximo o de gracia en curso. Se muestra en admin y
// caja para que el corte nunca llegue de sorpresa.
@Component({
  selector: 'app-subscription-status',
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: './subscription-status.component.html',
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
