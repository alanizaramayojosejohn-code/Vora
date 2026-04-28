import { ChangeDetectionStrategy, Component, computed, inject } from '@angular/core';
import { Router, RouterLink, RouterLinkActive, RouterOutlet } from '@angular/router';
import { AuthService } from '../../../services/auth/auth.service';

@Component({
  selector: 'app-caja-container',
  imports: [RouterOutlet, RouterLink, RouterLinkActive],
  templateUrl: './component.html',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class CajaContainerComponent {
  private readonly router = inject(Router);
  protected readonly auth = inject(AuthService);

  readonly audienceLabel = 'Caja';
  readonly isGym = computed(() => this.auth.businessType() === 'gym');

  async logout(): Promise<void> {
    await this.auth.logout();
    await this.router.navigateByUrl('/login');
  }
}
