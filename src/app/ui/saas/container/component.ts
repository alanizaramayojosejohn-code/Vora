import { ChangeDetectionStrategy, Component } from '@angular/core';
import { AmbientGlowComponent } from '../../shared/ambient-glow.component';
import { RouteViewComponent } from '../../shared/route-view.component';
import { SidebarComponent } from '../../shared/sidebar.component';
import { SidebarNavGroup } from '../../shared/sidebar-nav.model';

@Component({
  selector: 'app-saas-container',
  imports: [AmbientGlowComponent, SidebarComponent, RouteViewComponent],
  templateUrl: './component.html',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class SaasContainerComponent {
  readonly audienceLabel = 'SaaS';

  readonly navGroups: SidebarNavGroup[] = [
    { label: 'Plataforma', items: [
        { route: '/saas/home', label: 'Inicio', icon: 'home', exact: true },
        { route: '/saas/businesses', label: 'Negocios', icon: 'building' },
        { route: '/saas/subscriptions', label: 'Facturación', icon: 'credit-card' },
    ]},
  ];
}
