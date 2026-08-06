import { ChangeDetectionStrategy, Component, computed, inject, signal } from '@angular/core';
import { Router, RouterLink, RouterLinkActive } from '@angular/router';
import { AuthService } from '../../../services/auth/auth.service';
import { ThemeModeToggleComponent } from '../../shared/theme-mode-toggle.component';
import { RouteViewComponent } from '../../shared/route-view.component';
import { MenuToggleComponent } from '../../shared/menu-toggle.component';

@Component({
  selector: 'app-saas-container',
  imports: [MenuToggleComponent, RouteViewComponent, RouterLink, RouterLinkActive, ThemeModeToggleComponent],
  templateUrl: './component.html',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class SaasContainerComponent {
  private readonly router = inject(Router);
  protected readonly auth = inject(AuthService);

  readonly audienceLabel = 'SaaS';
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
