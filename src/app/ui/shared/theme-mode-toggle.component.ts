import { ChangeDetectionStrategy, Component, computed, inject } from '@angular/core';
import { ThemeService } from '../../services/theme/theme.service';
import { ThemeMode } from '../../services/theme/theme.presets';

// Toggle compacto para el modo claro/oscuro/sistema.
// Es preferencia GLOBAL del usuario en este navegador, no del negocio.
// El theme.service persiste en localStorage automaticamente al hacer setMode().
//
// Se monta en los headers de las shells (admin/caja/saas) — el publico
// (login) no lo necesita: el flash inicial sigue prefers-color-scheme.
@Component({
  selector: 'app-theme-mode-toggle',
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <div class="inline-flex rounded-lg border border-border-subtle bg-elevated p-0.5"
         role="radiogroup"
         aria-label="Modo de visualización">
      <button type="button"
              role="radio"
              [attr.aria-checked]="mode() === 'light'"
              (click)="set('light')"
              [class.bg-primary]="mode() === 'light'"
              [class.text-primary-fg]="mode() === 'light'"
              [class.shadow-sm]="mode() === 'light'"
              [class.text-foreground-muted]="mode() !== 'light'"
              [class.hover:text-foreground]="mode() !== 'light'"
              class="p-1.5 rounded-md transition"
              title="Modo claro">
        <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24"
             fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
          <circle cx="12" cy="12" r="4"/>
          <path d="M12 2v2"/><path d="M12 20v2"/>
          <path d="m4.93 4.93 1.41 1.41"/><path d="m17.66 17.66 1.41 1.41"/>
          <path d="M2 12h2"/><path d="M20 12h2"/>
          <path d="m6.34 17.66-1.41 1.41"/><path d="m19.07 4.93-1.41 1.41"/>
        </svg>
      </button>
      <button type="button"
              role="radio"
              [attr.aria-checked]="mode() === 'dark'"
              (click)="set('dark')"
              [class.bg-primary]="mode() === 'dark'"
              [class.text-primary-fg]="mode() === 'dark'"
              [class.shadow-sm]="mode() === 'dark'"
              [class.text-foreground-muted]="mode() !== 'dark'"
              [class.hover:text-foreground]="mode() !== 'dark'"
              class="p-1.5 rounded-md transition"
              title="Modo oscuro">
        <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24"
             fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
          <path d="M12 3a6 6 0 0 0 9 9 9 9 0 1 1-9-9Z"/>
        </svg>
      </button>
      <button type="button"
              role="radio"
              [attr.aria-checked]="mode() === 'system'"
              (click)="set('system')"
              [class.bg-primary]="mode() === 'system'"
              [class.text-primary-fg]="mode() === 'system'"
              [class.shadow-sm]="mode() === 'system'"
              [class.text-foreground-muted]="mode() !== 'system'"
              [class.hover:text-foreground]="mode() !== 'system'"
              class="p-1.5 rounded-md transition"
              title="Seguir el sistema">
        <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24"
             fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
          <rect width="20" height="14" x="2" y="3" rx="2"/>
          <line x1="8" x2="16" y1="21" y2="21"/>
          <line x1="12" x2="12" y1="17" y2="21"/>
        </svg>
      </button>
    </div>
  `,
})
export class ThemeModeToggleComponent {
  private readonly theme = inject(ThemeService);
  readonly mode = computed(() => this.theme.currentMode());

  set(mode: ThemeMode): void {
    this.theme.setMode(mode);
  }
}
