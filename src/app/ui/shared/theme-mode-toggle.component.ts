import { ChangeDetectionStrategy, Component, computed, inject, input } from '@angular/core';
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
  templateUrl: './theme-mode-toggle.component.html',
})
export class ThemeModeToggleComponent {
  private readonly theme = inject(ThemeService);
  readonly mode = computed(() => this.theme.currentMode());

  readonly compact = input(false);

  readonly modeTitle = computed(() => {
    switch (this.mode()) {
      case 'light': return 'Modo: claro';
      case 'dark': return 'Modo: oscuro';
      case 'system': return 'Modo: automático';
    }
  });

  private readonly cycle: ThemeMode[] = ['light', 'dark', 'system'];

  advance(): void {
    const next = this.cycle[(this.cycle.indexOf(this.mode()) + 1) % this.cycle.length];
    this.set(next);
  }

  set(mode: ThemeMode): void {
    this.theme.setMode(mode);
  }
}
