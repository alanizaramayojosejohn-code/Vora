import { ChangeDetectionStrategy, Component } from '@angular/core';
import { AmbientGlowComponent } from '../../shared/ambient-glow.component';
import { RouteViewComponent } from '../../shared/route-view.component';
import { SidebarComponent } from '../../shared/sidebar.component';
import { SubscriptionStatusComponent } from '../../shared/subscription-status.component';
import { SidebarNavGroup } from '../../shared/sidebar-nav.model';

@Component({
  selector: 'app-admin-container',
  imports: [AmbientGlowComponent, SidebarComponent, RouteViewComponent, SubscriptionStatusComponent],
  templateUrl: './component.html',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class AdminContainerComponent {
  readonly audienceLabel = 'Admin';

  readonly navGroups: SidebarNavGroup[] = [
    { label: 'General', items: [
        { route: '/admin/home', label: 'Inicio', icon: 'home', exact: true },
    ]},
    { label: 'Operación', items: [
        { route: '/admin/clients', label: 'Clientes', icon: 'users' },
        { route: '/admin/products', label: 'Productos', icon: 'box' },
        { route: '/admin/categories', label: 'Categorías', icon: 'folder' },
        { route: '/admin/tables', label: 'Mesas', icon: 'table' },
        { route: '/admin/users', label: 'Usuarios', icon: 'user-cog' },
    ]},
    { label: 'Personal', planFeature: 'staff', items: [
        { route: '/admin/staff', label: 'Personal', icon: 'users' },
    ]},
    { label: 'Provisiones', planFeature: 'purchases', items: [
        { route: '/admin/purchases', label: 'Provisiones', icon: 'package' },
    ]},
    { label: 'Ventas', items: [
        { route: '/admin/sales', label: 'Ventas', icon: 'cart' },
        { route: '/admin/turno', label: 'Mi turno de caja', icon: 'clock' },
    ]},
    { label: 'Análisis', items: [
        { route: '/admin/reports', label: 'Reportes', icon: 'bar-chart' },
    ]},
  ];
}
