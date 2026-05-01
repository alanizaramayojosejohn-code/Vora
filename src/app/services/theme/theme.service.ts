import { Injectable, signal } from '@angular/core';
import {
  BusinessTheme,
  DEFAULT_MODE,
  DEFAULT_THEME,
  getPreset,
  THEME_MODE_STORAGE_KEY,
  THEME_PRESET_LIST,
  ThemeMode,
  ThemePreset,
  ThemeTokens,
} from './theme.presets';

// Aplica el tema al documento via data-attributes en <html>.
// Dos canales independientes:
//  · preset: viene del business asignado por el super_admin → auth.service
//    lo carga al login y llama applyPreset().
//  · mode (light/dark/system): preferencia del USUARIO en este navegador,
//    se persiste en localStorage. setMode() la cambia en runtime.
//
// Las variables CSS dependen de la combinacion preset+mode resueltos.
// Para 'system', escuchamos prefers-color-scheme y re-aplicamos sin reload.
@Injectable({ providedIn: 'root' })
export class ThemeService {
  // Tema (preset) actualmente aplicado. UI lo lee para resaltar el preset
  // activo en pickers (form de business).
  readonly currentPreset = signal<BusinessTheme>(DEFAULT_THEME);

  // Modo elegido por el usuario (puede ser 'system'). UI lo lee para el toggle.
  readonly currentMode = signal<ThemeMode>(DEFAULT_MODE);

  // Modo efectivamente aplicado (resuelto si currentMode = 'system').
  // Util para componentes que necesiten saber el modo real (logo claro vs
  // oscuro, etc.).
  readonly resolvedMode = signal<'light' | 'dark'>('light');

  private mediaQuery: MediaQueryList | null = null;
  private mediaListener: ((e: MediaQueryListEvent) => void) | null = null;

  constructor() {
    // Cargar mode persistido. En SSR window/localStorage no existen,
    // asi que protegemos con typeof checks.
    if (typeof window !== 'undefined' && typeof localStorage !== 'undefined') {
      const stored = localStorage.getItem(THEME_MODE_STORAGE_KEY) as ThemeMode | null;
      if (stored === 'light' || stored === 'dark' || stored === 'system') {
        this.currentMode.set(stored);
      }
    }
  }

  // Llamado por auth.service.loadProfile() cuando viene preset del business,
  // y por reset() cuando no hay sesion. No toca el mode (separado).
  applyPreset(theme: BusinessTheme): void {
    this.currentPreset.set(theme);
    this.applyToDom();
  }

  // Toggle del usuario. Persiste en localStorage para que la proxima carga
  // arranque con la misma preferencia (sin esperar a que initialize aplique
  // nada — la lee el constructor).
  setMode(mode: ThemeMode): void {
    this.currentMode.set(mode);
    if (typeof localStorage !== 'undefined') {
      localStorage.setItem(THEME_MODE_STORAGE_KEY, mode);
    }
    this.applyToDom();
  }

  // Resetea el preset al default (monochrome). NO toca el mode — la
  // preferencia del usuario sobrevive logout/login.
  reset(): void {
    this.applyPreset(DEFAULT_THEME);
  }

  private applyToDom(): void {
    const root = document.documentElement;
    const preset = getPreset(this.currentPreset().preset);
    root.dataset['preset'] = preset.key;
    this.applyModeResolution(this.currentMode(), preset);
  }

  private applyModeResolution(mode: ThemeMode, preset: ThemePreset): void {
    this.detachMediaListener();

    if (mode === 'system') {
      // Mientras este en 'system', escuchamos cambios del SO.
      this.mediaQuery = window.matchMedia('(prefers-color-scheme: dark)');
      this.mediaListener = (e) => this.setResolvedMode(e.matches ? 'dark' : 'light', preset);
      this.mediaQuery.addEventListener('change', this.mediaListener);
      this.setResolvedMode(this.mediaQuery.matches ? 'dark' : 'light', preset);
    } else {
      this.setResolvedMode(mode, preset);
    }
  }

  private setResolvedMode(mode: 'light' | 'dark', preset: ThemePreset): void {
    const root = document.documentElement;
    root.dataset['mode'] = mode;
    this.resolvedMode.set(mode);
    const tokens = mode === 'dark' ? preset.dark : preset.light;
    this.writeTokensToRoot(root, tokens);
  }

  private writeTokensToRoot(root: HTMLElement, tokens: ThemeTokens): void {
    root.style.setProperty('--c-base', tokens.base);
    root.style.setProperty('--c-surface', tokens.surface);
    root.style.setProperty('--c-elevated', tokens.elevated);
    root.style.setProperty('--c-input', tokens.input);
    root.style.setProperty('--c-muted', tokens.muted);
    root.style.setProperty('--c-foreground', tokens.foreground);
    root.style.setProperty('--c-foreground-muted', tokens.foregroundMuted);
    root.style.setProperty('--c-foreground-subtle', tokens.foregroundSubtle);
    root.style.setProperty('--c-foreground-faint', tokens.foregroundFaint);
    root.style.setProperty('--c-border', tokens.border);
    root.style.setProperty('--c-border-subtle', tokens.borderSubtle);
    root.style.setProperty('--c-primary', tokens.primary);
    root.style.setProperty('--c-primary-fg', tokens.primaryFg);
    root.style.setProperty('--c-accent', tokens.accent);
    root.style.setProperty('--c-accent-fg', tokens.accentFg);
    root.style.setProperty('--c-success', tokens.success);
    root.style.setProperty('--c-danger', tokens.danger);
    root.style.setProperty('--c-warning', tokens.warning);
  }

  private detachMediaListener(): void {
    if (this.mediaQuery && this.mediaListener) {
      this.mediaQuery.removeEventListener('change', this.mediaListener);
    }
    this.mediaQuery = null;
    this.mediaListener = null;
  }

  getPresets(): readonly ThemePreset[] {
    return THEME_PRESET_LIST;
  }
}
