import { ChangeDetectionStrategy, Component, computed, inject, input } from '@angular/core';
import { AuthService } from '../../services/auth/auth.service';
import { ThemeService } from '../../services/theme/theme.service';

@Component({
  selector: 'app-brand-logo',
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    @if (logoUrl()) {
      <img [src]="logoUrl()" [alt]="name()"
           class="rounded-lg object-contain border border-border-subtle bg-elevated flex-shrink-0"
           [class.w-7]="small()" [class.h-7]="small()"
           [class.w-9]="!small()" [class.h-9]="!small()" />
    } @else {
      <img [src]="systemLogoUrl()" alt="Vora"
           class="rounded-lg object-contain flex-shrink-0"
           [class.w-7]="small()" [class.h-7]="small()"
           [class.w-9]="!small()" [class.h-9]="!small()" />
    }

    <!-- Nombre del negocio -->
    <span class="font-bold text-foreground tracking-tight truncate min-w-0">{{ name() }}</span>

    <!-- Badge de rol (Admin / Caja). Usa el color de acento del negocio: es un
         elemento de marca, sale en todas las pantallas y el par
         bg-accent/text-accent-fg tiene contraste garantizado en cualquier
         preset. El borde lo salva de desaparecer cuando el acento coincide
         con el fondo (preset mono: acento blanco en modo claro). -->
    @if (badge()) {
      <span class="text-[10px] font-bold uppercase tracking-widest px-1.5 py-0.5 rounded bg-accent text-accent-fg border border-border-subtle flex-shrink-0">
        {{ badge() }}
      </span>
    }
  `,
})
export class BrandLogoComponent {
  private readonly auth = inject(AuthService);
  private readonly theme = inject(ThemeService);

  readonly badge = input<string>('');
  readonly small = input(false);

  readonly logoUrl = computed(() => this.auth.businessLogoUrl());
  readonly name = computed(() => this.auth.businessName() ?? 'Vora');

  readonly systemLogoUrl = computed(() =>
    this.theme.resolvedMode() === 'light' ? 'img/logo_white.png' : 'img/logo_dark.png'
  );
}
