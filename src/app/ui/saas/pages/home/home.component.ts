import { ChangeDetectionStrategy, Component, computed, inject, signal } from '@angular/core';
import { DatePipe } from '@angular/common';
import { RouterLink } from '@angular/router';
import { AuthService } from '../../../../services/auth/auth.service';
import { BusinessQueryService } from '../../../../services/business/query.service';
import { Business } from '../../../../models/business.model';
import { BusinessWithSubscription, SubscriptionService } from '../../../../services/subscription/subscription.service';
import { getPreset } from '../../../../services/theme/theme.presets';

@Component({
  selector: 'app-saas-home',
  imports: [DatePipe, RouterLink],
  templateUrl: './home.component.html',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class SaasHomeComponent {
  private readonly businessQuery = inject(BusinessQueryService);
  private readonly subscriptions = inject(SubscriptionService);
  protected readonly auth = inject(AuthService);

  readonly loading = signal(true);
  readonly businesses = signal<Business[]>([]);
  readonly now = signal(new Date());

  // ── Cobranza ───────────────────────────────────────────────────────────
  // El aviso vive acá y no en el correo: es lo primero que se ve al entrar.
  readonly subscriptionItems = signal<BusinessWithSubscription[]>([]);

  // Vencidas primero, luego las que están más cerca de vencer.
  readonly needsAttention = computed(() =>
    this.subscriptionItems()
      .filter((i) => i.subscription && (i.isExpired || i.isExpiringSoon))
      .sort((a, b) => (a.daysUntilExpiry ?? 0) - (b.daysUntilExpiry ?? 0)),
  );

  readonly expiredCount = computed(
    () => this.needsAttention().filter((i) => i.isExpired).length,
  );

  // Negocios sin suscripción cargada: no se les cobra ni se les bloquea nada.
  readonly withoutSubscription = computed(
    () => this.subscriptionItems().filter((i) => !i.subscription).length,
  );

  readonly total = computed(() => this.businesses().length);

  readonly recentCount = computed(() => {
    const cutoff = new Date();
    cutoff.setDate(cutoff.getDate() - 30);
    return this.businesses().filter((b) => new Date(b.created_at) >= cutoff).length;
  });

  // Top 5 negocios mas recientes (listBusinesses ya viene ordenado desc).
  readonly latestBusinesses = computed(() => this.businesses().slice(0, 5));

  // Ranking de presets: cuantos negocios usan cada paleta. Util para el
  // super_admin que ve si la mayoria sigue con el monocromo default.
  readonly presetUsage = computed<{ key: string; label: string; color: string; count: number }[]>(() => {
    const counts = new Map<string, number>();
    for (const b of this.businesses()) {
      const key = b.theme?.preset ?? 'monochrome';
      counts.set(key, (counts.get(key) ?? 0) + 1);
    }
    return Array.from(counts.entries())
      .map(([key, count]) => {
        const p = getPreset(key);
        return { key, label: p.label, color: p.light.primary, count };
      })
      .sort((a, b) => b.count - a.count);
  });

  constructor() {
    void this.refresh();
  }

  async refresh(): Promise<void> {
    this.loading.set(true);
    try {
      const [businesses, subscriptions] = await Promise.all([
        this.businessQuery.listBusinesses(),
        this.subscriptions.listBusinessesWithSubscriptions(),
      ]);
      this.businesses.set(businesses);
      this.subscriptionItems.set(subscriptions);
    } catch (err) {
      console.error('Error cargando dashboard SaaS', err);
    } finally {
      this.loading.set(false);
    }
  }

  attentionLabel(item: BusinessWithSubscription): string {
    const days = item.daysUntilExpiry ?? 0;
    if (days < 0) return `Vencida hace ${Math.abs(days)} día${days === -1 ? '' : 's'}`;
    if (days === 0) return 'Vence hoy';
    return `Vence en ${days} día${days === 1 ? '' : 's'}`;
  }

  primaryColor(business: Business): string {
    return getPreset(business.theme).light.primary;
  }

  presetLabel(business: Business): string {
    return getPreset(business.theme).label;
  }
}
