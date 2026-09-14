import { ChangeDetectionStrategy, Component, inject } from '@angular/core';
import { SwUpdateService } from '../../services/pwa/sw-update.service';

// Aviso de versión nueva. Deliberadamente flotante y descartable: en caja no
// se puede recargar por sorpresa a alguien que está cobrando.
@Component({
  selector: 'app-sw-update-banner',
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: './sw-update-banner.component.html',
  styles: [`
    .sw-slide-up {
      animation: sw-slide-up 0.3s cubic-bezier(0.16, 1, 0.3, 1) both;
    }
    @keyframes sw-slide-up {
      from { transform: translateY(100%); opacity: 0; }
      to   { transform: translateY(0);    opacity: 1; }
    }
  `],
})
export class SwUpdateBannerComponent {
  protected readonly sw = inject(SwUpdateService);
}
