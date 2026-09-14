import { ChangeDetectionStrategy, Component, computed, inject, input } from '@angular/core';
import { AuthService } from '../../services/auth/auth.service';
import { ThemeService } from '../../services/theme/theme.service';

@Component({
  selector: 'app-brand-logo',
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: './brand-logo.component.html',
})
export class BrandLogoComponent {
  private readonly auth = inject(AuthService);
  private readonly theme = inject(ThemeService);

  readonly badge = input<string>('');
  readonly small = input(false);
  readonly compact = input(false);

  readonly logoUrl = computed(() => this.auth.businessLogoUrl());
  readonly name = computed(() => this.auth.businessName() ?? 'Vora');

  readonly systemLogoUrl = computed(() =>
    this.theme.resolvedMode() === 'light' ? 'img/logo_white.png' : 'img/logo_dark.png'
  );
}
