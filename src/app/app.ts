import { Component, signal, ChangeDetectionStrategy } from '@angular/core';
import { RouterOutlet } from '@angular/router';
import { PwaInstallBannerComponent } from './ui/shared/pwa-install-banner.component';
import { SwUpdateBannerComponent } from './ui/shared/sw-update-banner.component';

@Component({
  selector: 'app-root',
  imports: [RouterOutlet, PwaInstallBannerComponent, SwUpdateBannerComponent],
  templateUrl: './app.html',
  // Eager es una estrategia real de Angular (no "sin declarar"), deliberada
  // en el shell raíz; la regla solo reconoce OnPush como válido y no
  // distingue Eager de Default.
  // eslint-disable-next-line @angular-eslint/prefer-on-push-component-change-detection
  changeDetection: ChangeDetectionStrategy.Eager,
  styleUrl: './app.css',
})
export class App {
  protected readonly title = signal('Vora');
}
