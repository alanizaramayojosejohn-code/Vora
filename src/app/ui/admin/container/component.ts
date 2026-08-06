import { ChangeDetectionStrategy, Component, computed, inject, signal } from '@angular/core';
import { Router, RouterLink, RouterLinkActive } from '@angular/router';
import { AuthService } from '../../../services/auth/auth.service';
import { BrandLogoComponent } from '../../shared/brand-logo.component';
import { RouteViewComponent } from '../../shared/route-view.component';
import { MenuToggleComponent } from '../../shared/menu-toggle.component';
import { IfPlanDirective } from '../../shared/if-plan.directive';
import { SubscriptionStatusComponent } from '../../shared/subscription-status.component';
import { ThemeModeToggleComponent } from '../../shared/theme-mode-toggle.component';

@Component({
  selector: 'app-admin-container',
  imports: [MenuToggleComponent, RouteViewComponent, RouterLink, RouterLinkActive, ThemeModeToggleComponent, BrandLogoComponent, SubscriptionStatusComponent, IfPlanDirective],
  templateUrl: './component.html',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class AdminContainerComponent {
  private readonly router = inject(Router);
  protected readonly auth = inject(AuthService);

  readonly audienceLabel = 'Admin';
  readonly sidebarOpen = signal(false);

  // 2 letras del nombre para el avatar circle del sidebar.
  // Ej: "Daniela Mendez" → "DM", "Jose" → "JO".
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
