import { ChangeDetectionStrategy, Component, computed, inject, signal } from '@angular/core';
import { Router, RouterLink, RouterLinkActive, RouterOutlet } from '@angular/router';
import { AuthService } from '../../../services/auth/auth.service';
import { SyncService } from '../../../services/offline/sync.service';
import { BrandLogoComponent } from '../../shared/brand-logo.component';
import { ThemeModeToggleComponent } from '../../shared/theme-mode-toggle.component';
import { OfflineStatusComponent } from '../../shared/offline-status.component';

@Component({
  selector: 'app-caja-container',
  imports: [RouterOutlet, RouterLink, RouterLinkActive, ThemeModeToggleComponent, BrandLogoComponent, OfflineStatusComponent],
  templateUrl: './component.html',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class CajaContainerComponent {
  private readonly router = inject(Router);
  protected readonly auth = inject(AuthService);
  // Inyectado para que SyncService se cree y empiece a escuchar conexión
  readonly _sync = inject(SyncService);

  readonly audienceLabel = 'Caja';
  readonly sidebarOpen = signal(false);

  readonly initials = computed(() => {
    const name = this.auth.profile()?.name?.trim() ?? '';
    if (!name) return '··';
    const parts = name.split(/\s+/).filter(Boolean);
    if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
    return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
  });

  async logout(): Promise<void> {
    await this.auth.logout();
    await this.router.navigateByUrl('/login');
  }
}
