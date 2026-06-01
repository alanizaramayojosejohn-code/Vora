import { Component, signal } from '@angular/core';
import { RouterOutlet } from '@angular/router';
import { PwaInstallBannerComponent } from './ui/shared/pwa-install-banner.component';

@Component({
  selector: 'app-root',
  imports: [RouterOutlet, PwaInstallBannerComponent],
  templateUrl: './app.html',
  styleUrl: './app.css'
})
export class App {
  protected readonly title = signal('Vora');
}
