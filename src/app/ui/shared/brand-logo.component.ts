import { ChangeDetectionStrategy, Component, computed, inject, input } from '@angular/core';
import { AuthService } from '../../services/auth/auth.service';

@Component({
  selector: 'app-brand-logo',
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <!-- Logo o inicial del negocio -->
    @if (logoUrl()) {
      <img [src]="logoUrl()" [alt]="name()"
           class="rounded-lg object-contain border border-border-subtle bg-elevated flex-shrink-0"
           [class.w-7]="small()" [class.h-7]="small()"
           [class.w-9]="!small()" [class.h-9]="!small()" />
    } @else {
      <div class="rounded-lg bg-primary text-primary-fg flex items-center justify-center font-bold flex-shrink-0"
           [class.w-7]="small()" [class.h-7]="small()" [class.text-xs]="small()"
           [class.w-9]="!small()" [class.h-9]="!small()" [class.text-sm]="!small()">
        {{ initial() }}
      </div>
    }

    <!-- Nombre del negocio -->
    <span class="font-bold text-foreground tracking-tight truncate min-w-0">{{ name() }}</span>

    <!-- Badge de rol (Admin / Caja) -->
    @if (badge()) {
      <span class="text-[10px] font-bold text-foreground-muted uppercase tracking-widest px-1.5 py-0.5 rounded bg-muted border border-border-subtle flex-shrink-0">
        {{ badge() }}
      </span>
    }
  `,
})
export class BrandLogoComponent {
  private readonly auth = inject(AuthService);

  /** 'admin' | 'caja' — etiqueta que se muestra como badge */
  readonly badge = input<string>('');

  /** true → tamaño móvil (w-7 h-7), false → tamaño sidebar (w-9 h-9) */
  readonly small = input(false);

  readonly logoUrl = computed(() => this.auth.businessLogoUrl());
  readonly name = computed(() => this.auth.businessName() ?? 'SaasCafes');

  readonly initial = computed(() => {
    const n = this.name().trim();
    if (!n) return 'S';
    return n[0].toUpperCase();
  });
}
