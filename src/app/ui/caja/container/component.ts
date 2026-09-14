import { ChangeDetectionStrategy, Component, inject } from '@angular/core';
import { SyncService } from '../../../services/offline/sync.service';
import { AmbientGlowComponent } from '../../shared/ambient-glow.component';
import { OfflineStatusComponent } from '../../shared/offline-status.component';
import { RouteViewComponent } from '../../shared/route-view.component';
import { SidebarComponent } from '../../shared/sidebar.component';
import { SubscriptionStatusComponent } from '../../shared/subscription-status.component';
import { SidebarNavGroup } from '../../shared/sidebar-nav.model';

@Component({
  selector: 'app-caja-container',
  imports: [AmbientGlowComponent, SidebarComponent, RouteViewComponent, OfflineStatusComponent, SubscriptionStatusComponent],
  templateUrl: './component.html',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class CajaContainerComponent {
  // Inyectado para que SyncService se cree y empiece a escuchar conexión
  readonly _sync = inject(SyncService);

  readonly audienceLabel = 'Caja';

  readonly navGroups: SidebarNavGroup[] = [
    { label: 'Operación', items: [
        { route: '/caja/home', label: 'Inicio', icon: 'home', exact: true },
        { route: '/caja/sales', label: 'Ventas', icon: 'cart' },
        { route: '/caja/turno', label: 'Caja', icon: 'clock' },
        { route: '/caja/clients', label: 'Clientes', icon: 'users' },
    ]},
  ];
}
