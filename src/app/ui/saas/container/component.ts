import { ChangeDetectionStrategy, Component, inject } from '@angular/core';
import { Router, RouterLink, RouterLinkActive, RouterOutlet } from '@angular/router';
import { AuthService } from '../../../services/auth/auth.service';

@Component({
  selector: 'app-saas-container',
  imports: [RouterOutlet, RouterLink, RouterLinkActive],
  templateUrl: './component.html',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class SaasContainerComponent {
  private readonly router = inject(Router);
  protected readonly auth = inject(AuthService);

  readonly audienceLabel = 'SaaS';

  async logout(): Promise<void> {
    await this.auth.logout();
    await this.router.navigateByUrl('/login');
  }
}
