import { ChangeDetectionStrategy, Component, computed, effect, inject, signal } from '@angular/core';
import { Router, RouterLink, RouterLinkActive } from '@angular/router';
import { AuthService } from '../../../services/auth/auth.service';
import { ViewportService } from '../../../services/layout/viewport.service';
import { AmbientGlowComponent } from '../../shared/ambient-glow.component';
import { BrandLogoComponent } from '../../shared/brand-logo.component';
import { RouteViewComponent } from '../../shared/route-view.component';
import { MenuToggleComponent } from '../../shared/menu-toggle.component';
import { IfPlanDirective } from '../../shared/if-plan.directive';
import { SubscriptionStatusComponent } from '../../shared/subscription-status.component';
import { ThemeModeToggleComponent } from '../../shared/theme-mode-toggle.component';

@Component({
  selector: 'app-admin-container',
  imports: [AmbientGlowComponent, MenuToggleComponent, RouteViewComponent, RouterLink, RouterLinkActive, ThemeModeToggleComponent, BrandLogoComponent, SubscriptionStatusComponent, IfPlanDirective],
  templateUrl: './component.html',
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: {
    '(document:keydown.escape)': 'onEscape()',
  },
})
export class AdminContainerComponent {
  private readonly router = inject(Router);
  protected readonly auth = inject(AuthService);
  protected readonly viewport = inject(ViewportService);

  readonly audienceLabel = 'Admin';
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

  readonly navItemClass = computed(() => this.isRailCollapsed()
    ? 'flex flex-col items-center justify-center gap-1 px-1 py-2.5 rounded-[13px] text-[9px] font-bold uppercase tracking-wide text-center leading-tight line-clamp-2 text-foreground-muted hover:text-foreground hover:bg-muted transition mb-0.5'
    : 'flex items-center gap-2.5 px-3 py-2 text-sm font-medium text-foreground-muted hover:text-foreground hover:bg-muted rounded-lg transition mb-0.5');

  constructor() {
    // Con el drawer móvil abierto se bloquea el scroll del fondo (ver
    // .scroll-locked en styles.css, que solo pesa por debajo de `lg`).
    effect((onCleanup) => {
      if (!this.sidebarOpen()) return;
      document.body.classList.add('scroll-locked');
      onCleanup(() => document.body.classList.remove('scroll-locked'));
    });
  }

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

  onEscape(): void {
    if (this.sidebarOpen()) this.sidebarOpen.set(false);
  }

  toggleCollapsed(): void {
    this.sidebarCollapsed.set(!this.sidebarCollapsed());
  }

  // El cierre del drawer vive en el <nav> y no repetido en cada link, pero
  // solo debe disparar cuando el toque fue sobre un link: los títulos de
  // sección ("General", "Operación") también están dentro del nav, y cerrar
  // el menú al tocar una etiqueta que no navega a ningún lado deja al usuario
  // fuera de donde estaba sin haber elegido nada.
  closeIfNavLink(event: Event): void {
    if ((event.target as HTMLElement).closest('a')) this.sidebarOpen.set(false);
  }
}
