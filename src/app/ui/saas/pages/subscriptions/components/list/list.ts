import { CurrencyPipe, DatePipe, NgClass } from '@angular/common';
import { ChangeDetectionStrategy, Component, computed, input, output, signal } from '@angular/core';
import { BusinessWithSubscription } from '../../../../../../services/subscription/subscription.service';
import { Business } from '../../../../../../models/business.model';
import { contrastColor, getPreset } from '../../../../../../services/theme/theme.presets';
import { SkeletonRowsComponent } from '../../../../../shared/skeleton-rows.component';

@Component({
  selector: 'app-saas-subscriptions-list',
  imports: [SkeletonRowsComponent, DatePipe, CurrencyPipe, NgClass],
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

  // Un ícono por estado para que se lea sin pasar por el texto: reloj
  // (por vencer), alerta (vencida), check (activa), círculo tachado (sin
  // configurar). Cada string es el `d` de un <path>; statusClasses() ya
  // trae el color, esto solo suma la forma.
  statusIconPaths(item: BusinessWithSubscription): string[] {
    if (!item.subscription) return ['M4.9 4.9l14.2 14.2', 'M12 21a9 9 0 1 0 0-18 9 9 0 0 0 0 18Z'];
    if (item.isExpired) {
      return [
        'M10.29 3.86 1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0Z',
        'M12 9v4', 'M12 17h.01',
      ];
    }
    if (item.isExpiringSoon) return ['M12 21a9 9 0 1 0 0-18 9 9 0 0 0 0 18Z', 'M12 7v5l3 3'];
    return ['M5 13l4 4L19 7'];
  }

  initials(name: string): string {
    const parts = name.trim().split(/\s+/).filter(Boolean);
    if (parts.length === 0) return '?';
    if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
    return (parts[0][0] + parts[1][0]).toUpperCase();
  }

  // Cada fila es un negocio distinto, cada uno con su propia paleta: el
  // avatar de iniciales usa el color de marca de ESE negocio (no el tema
  // del super_admin, que no tiene uno propio), igual que en la lista de
  // negocios.
  avatarColor(business: Business): string {
    return getPreset(business.theme).light.primary;
  }

  avatarTextColor(business: Business): string {
    return contrastColor(this.avatarColor(business));
  }
}
