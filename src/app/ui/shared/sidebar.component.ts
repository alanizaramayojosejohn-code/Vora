import { ChangeDetectionStrategy, Component, computed, effect, inject, input, signal } from '@angular/core';
import { Router, RouterLink } from '@angular/router';
import { AuthService } from '../../services/auth/auth.service';
import { ViewportService } from '../../services/layout/viewport.service';
import { BrandLogoComponent } from './brand-logo.component';
import { MenuToggleComponent } from './menu-toggle.component';
import { ThemeModeToggleComponent } from './theme-mode-toggle.component';
import { SidebarNavComponent } from './sidebar-nav.component';
import { SidebarNavGroup } from './sidebar-nav.model';

// Estructura completa del menú (topbar móvil, backdrop, aside, botón de
// colapso, marca, pie con tema+perfil+salir). Antes esto estaba triplicado
// —admin/caja/saas tenían cada uno su propia copia idéntica del drawer móvil
// y del rail colapsable de escritorio— y solo cambiaban entre sí en tres
// cosas: el texto del badge, los links de navegación y la ruta de perfil.
// Esas tres son ahora los únicos @Input.
@Component({
  selector: 'app-sidebar',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [RouterLink, MenuToggleComponent, BrandLogoComponent, ThemeModeToggleComponent, SidebarNavComponent],
  templateUrl: './sidebar.component.html',
  host: {
    '(document:keydown.escape)': 'onEscape()',
  },
})
export class SidebarComponent {
  private readonly router = inject(Router);
  protected readonly auth = inject(AuthService);
  protected readonly viewport = inject(ViewportService);

  readonly audienceLabel = input.required<string>();
  readonly navGroups = input.required<SidebarNavGroup[]>();
  readonly profileRoute = input.required<string>();

  readonly sidebarOpen = signal(false);

  // Colapso del sidebar en escritorio (rail de iconos, 84px). Es una feature
  // separada del drawer móvil: por eso el AND con isDesktop() en
  // isRailCollapsed — si alguien colapsa en escritorio y achica la ventana,
  // en móvil el drawer vuelve a verse completo sin importar este signal.
  readonly sidebarCollapsed = signal(false);
  readonly isRailCollapsed = computed(() => this.sidebarCollapsed() && this.viewport.isDesktop());

  readonly asideWidthClass = computed(() => this.isRailCollapsed() ? 'lg:w-[84px]' : 'lg:w-60');

  readonly brandContainerClass = computed(() => this.isRailCollapsed()
    ? 'px-0 py-5 flex items-center justify-center'
    : 'px-5 py-5 flex items-center gap-2.5 min-w-0');

  readonly initials = computed(() => {
    const name = this.auth.profile()?.name?.trim() ?? '';
    if (!name) return '··';
    const parts = name.split(/\s+/).filter(Boolean);
    if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
    return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
  });

  constructor() {
    // Con el drawer móvil abierto se bloquea el scroll del fondo (ver
    // .scroll-locked en styles.css, que solo pesa por debajo de `lg`).
    effect((onCleanup) => {
      if (!this.sidebarOpen()) return;
      document.body.classList.add('scroll-locked');
      onCleanup(() => document.body.classList.remove('scroll-locked'));
    });
  }

  toggleCollapsed(): void {
    this.sidebarCollapsed.set(!this.sidebarCollapsed());
  }

  onEscape(): void {
    if (this.sidebarOpen()) this.sidebarOpen.set(false);
  }

  // El clic en un link de app-sidebar-nav burbujea hasta acá (no hace falta
  // un @Output: Angular no mete Shadow DOM real, así que el click nativo del
  // <a> interno sigue subiendo por el DOM). Solo cierra el drawer si el
  // toque fue sobre un link: los encabezados de sección también están
  // dentro del nav, y cerrar el menú al tocar una etiqueta que no navega a
  // ningún lado deja al usuario fuera de donde estaba sin haber elegido nada.
  closeIfNavLink(event: Event): void {
    if ((event.target as HTMLElement).closest('a')) this.sidebarOpen.set(false);
  }

  async logout(): Promise<void> {
    await this.auth.logout();
    await this.router.navigateByUrl('/login');
  }
}
