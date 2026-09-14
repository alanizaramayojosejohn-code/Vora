import { ChangeDetectionStrategy, Component, computed, inject, input } from '@angular/core';
import { RouterLink, RouterLinkActive } from '@angular/router';
import { SubscriptionStateService } from '../../services/subscription/subscription-state.service';
import { SidebarNavGroup } from './sidebar-nav.model';

// Lista de opciones del sidebar (los <li> del menú). Recibe los grupos como
// datos en vez de tener cada link escrito a mano — antes esto estaba
// triplicado, con el mismo marcado repetido en admin/caja/saas.
@Component({
  selector: 'app-sidebar-nav',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [RouterLink, RouterLinkActive],
  templateUrl: './sidebar-nav.component.html',
})
export class SidebarNavComponent {
  private readonly subscriptionState = inject(SubscriptionStateService);

  readonly groups = input.required<SidebarNavGroup[]>();
  readonly collapsed = input(false);

  // No se usa *appIfPlan acá: esa directiva exige un PlanFeature obligatorio
  // y la mitad de los grupos no tienen ninguno (no están gateados).
  groupVisible(group: SidebarNavGroup): boolean {
    return !group.planFeature || this.subscriptionState.allows(group.planFeature);
  }

  readonly navItemClass = computed(() => this.collapsed()
    ? 'flex flex-col items-center justify-center gap-1 px-1 py-2.5 rounded-[13px] text-[9px] font-bold uppercase tracking-wide text-center leading-tight line-clamp-2 text-foreground-muted hover:text-foreground hover:bg-muted transition mb-0.5'
    : 'flex items-center gap-2.5 px-3 py-2 text-sm font-medium text-foreground-muted hover:text-foreground hover:bg-muted rounded-lg transition mb-0.5');
}
