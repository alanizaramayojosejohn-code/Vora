import { Component, inject, ChangeDetectionStrategy } from '@angular/core';
import { PwaInstallService } from '../../services/pwa/pwa-install.service';

@Component({
  selector: 'app-pwa-install-banner',
  templateUrl: './pwa-install-banner.component.html',
  // Eager, no "sin declarar": el evento beforeinstallprompt llega fuera de
  // la zona de Angular y necesita que el CD corra igual aunque no haya un
  // signal/input que lo dispare.
  // eslint-disable-next-line @angular-eslint/prefer-on-push-component-change-detection
  changeDetection: ChangeDetectionStrategy.Eager,
  styles: [
    `
      .pwa-slide-up {
        animation: pwa-slide-up 0.3s cubic-bezier(0.16, 1, 0.3, 1) both;
      }
      @keyframes pwa-slide-up {
        from {
          transform: translateY(100%);
          opacity: 0;
        }
        to {
          transform: translateY(0);
          opacity: 1;
        }
      }
    `,
  ],
})
export class PwaInstallBannerComponent {
  protected readonly pwa = inject(PwaInstallService);
}
