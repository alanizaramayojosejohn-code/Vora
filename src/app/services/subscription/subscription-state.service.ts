import { computed, inject, Injectable, signal } from '@angular/core';
import {
  evaluateSubscription,
  PlanFeature,
  planAllows,
  PlanType,
  SubscriptionStatus,
} from '../../models/subscription.model';
import { SubscriptionService } from './subscription.service';

// Suscripción del negocio del usuario actual, cacheada para no consultar en
// cada navegación. La consumen el guard de plan, el banner de vencimiento y
// las directivas que ocultan o deshabilitan features.
@Injectable({ providedIn: 'root' })
export class SubscriptionStateService {
  private readonly subscriptions = inject(SubscriptionService);

  readonly status = signal<SubscriptionStatus | null>(null);
  readonly plan = signal<PlanType | null>(null);

  private loaded = false;
  private inFlight: Promise<SubscriptionStatus | null> | null = null;

  readonly isBlocked = computed(() => this.status()?.isBlocked ?? false);

  allows(feature: PlanFeature): boolean {
    return planAllows(this.plan(), feature);
  }

  async ensureLoaded(): Promise<SubscriptionStatus | null> {
    if (this.loaded) return this.status();
    // Varias vistas piden esto a la vez al entrar; sin esto se dispararían
    // consultas duplicadas en cada navegación.
    if (this.inFlight) return this.inFlight;

    this.inFlight = this.load();
    try {
      return await this.inFlight;
    } finally {
      this.inFlight = null;
    }
  }

  private async load(): Promise<SubscriptionStatus | null> {
    try {
      const sub = await this.subscriptions.getOwnSubscription();
      const status = sub ? evaluateSubscription(sub) : null;
      this.status.set(status);
      this.plan.set(sub?.plan_type ?? null);
      this.loaded = true;
      return status;
    } catch {
      // Sin conexión o error de red: NO se bloquea nada. La caja tiene que
      // poder operar offline, y el corte real lo aplica Postgres.
      return null;
    }
  }

  reset(): void {
    this.loaded = false;
    this.inFlight = null;
    this.status.set(null);
    this.plan.set(null);
  }
}
