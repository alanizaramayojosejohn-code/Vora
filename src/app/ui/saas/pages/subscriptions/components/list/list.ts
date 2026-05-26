import { CurrencyPipe, DatePipe, NgClass } from '@angular/common';
import { ChangeDetectionStrategy, Component, computed, input, output, signal } from '@angular/core';
import { BusinessWithSubscription } from '../../../../../../services/subscription/subscription.service';

@Component({
  selector: 'app-saas-subscriptions-list',
  imports: [DatePipe, CurrencyPipe, NgClass],
  templateUrl: './list.html',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class SubscriptionsListComponent {
  readonly items = input<BusinessWithSubscription[]>([]);
  readonly loading = input<boolean>(false);

  readonly select = output<BusinessWithSubscription>();
  readonly configure = output<BusinessWithSubscription>();

  readonly search = signal('');

  readonly stats = computed(() => {
    const list = this.items();
    return {
      total: list.length,
      active: list.filter((i) => i.subscription && !i.isExpired && !i.isExpiringSoon).length,
      expiringSoon: list.filter((i) => i.isExpiringSoon).length,
      expired: list.filter((i) => i.isExpired).length,
      noSub: list.filter((i) => !i.subscription).length,
    };
  });

  readonly alerts = computed(() =>
    this.items().filter((i) => i.isExpiringSoon || i.isExpired),
  );

  readonly filtered = computed(() => {
    const q = this.search().toLowerCase();
    if (!q) return this.items();
    return this.items().filter((i) => i.business.name.toLowerCase().includes(q));
  });

  setSearch(v: string): void { this.search.set(v); }

  statusLabel(item: BusinessWithSubscription): string {
    if (!item.subscription) return 'Sin configurar';
    if (item.isExpired) return 'Vencida';
    if (item.isExpiringSoon) return `Vence en ${item.daysUntilExpiry} día${item.daysUntilExpiry === 1 ? '' : 's'}`;
    return 'Activa';
  }

  statusClasses(item: BusinessWithSubscription): string {
    if (!item.subscription) return 'bg-muted text-foreground-muted border-border-subtle';
    if (item.isExpired) return 'bg-danger/10 text-danger border-danger/20';
    if (item.isExpiringSoon) return 'bg-warning/10 text-warning border-warning/20';
    return 'bg-success/10 text-success border-success/20';
  }

  initials(name: string): string {
    const parts = name.trim().split(/\s+/).filter(Boolean);
    if (parts.length === 0) return '?';
    if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
    return (parts[0][0] + parts[1][0]).toUpperCase();
  }
}
