import { ChangeDetectionStrategy, Component, computed, inject, signal } from '@angular/core';
import { AbstractControl, FormBuilder, ReactiveFormsModule, ValidationErrors, Validators } from '@angular/forms';
import { AuthService } from '../../../services/auth/auth.service';
import { BusinessService } from '../../../services/business/business.service';
import { ThemeService } from '../../../services/theme/theme.service';
import { HsvPickerComponent } from '../hsv-picker/hsv-picker.component';
import {
  buildCustomPreset,
  BusinessTheme,
  contrastColor,
  THEME_PRESET_LIST,
  ThemePreset,
  ThemePresetKey,
} from '../../../services/theme/theme.presets';
import { errorMessage } from '../../../utilities/error-message';

function passwordsMatchValidator(group: AbstractControl): ValidationErrors | null {
  const newPw = group.get('newPassword')?.value;
  const confirm = group.get('confirmPassword')?.value;
  return newPw && confirm && newPw !== confirm ? { passwordsMismatch: true } : null;
}

@Component({
  selector: 'app-profile-page',
  imports: [ReactiveFormsModule, HsvPickerComponent],
  templateUrl: './component.html',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class ProfilePageComponent {
  private readonly fb = inject(FormBuilder);
  protected readonly auth = inject(AuthService);
  private readonly businessService = inject(BusinessService);
  private readonly themeService = inject(ThemeService);

  readonly email = computed(() => this.auth.session()?.user.email ?? '—');
  readonly name = computed(() => this.auth.profile()?.name ?? '');
  readonly ci = computed(() => this.auth.profile()?.ci ?? '—');
  readonly joinedAt = computed(() => {
    const d = this.auth.profile()?.created_at;
    if (!d) return '—';
    return new Date(d).toLocaleDateString('es-BO', { year: 'numeric', month: 'long', day: 'numeric' });
  });
  readonly roleLabel = computed(() => {
    const r = this.auth.profile()?.role;
    if (r === 'super_admin') return 'Super Admin';
    if (r === 'admin') return 'Administrador';
    if (r === 'caja') return 'Cajero';
    return r ?? '—';
  });
  readonly initials = computed(() => {
    const n = this.name().trim();
    if (!n) return '··';
    const parts = n.split(/\s+/).filter(Boolean);
    if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
    return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
  });

  // Sólo usuarios con proveedor email pueden cambiar contraseña desde aquí.
  // Los que usan Google gestionan su contraseña en cuentas de Google.
  readonly isEmailProvider = computed(() =>
    (this.auth.session()?.user.identities ?? []).some((i) => i.provider === 'email'),
  );

  readonly pwForm = this.fb.nonNullable.group(
    {
      currentPassword: ['', [Validators.required]],
      newPassword: ['', [Validators.required, Validators.minLength(6)]],
      confirmPassword: ['', [Validators.required]],
    },
    { validators: passwordsMatchValidator },
  );

  readonly pwSubmitting = signal(false);
  readonly pwError = signal<string | null>(null);
  readonly pwSuccess = signal(false);

  clearFeedback(): void {
    this.pwError.set(null);
    this.pwSuccess.set(false);
  }

  async changePassword(): Promise<void> {
    if (this.pwForm.invalid || this.pwSubmitting()) return;
    const { currentPassword, newPassword } = this.pwForm.getRawValue();
    this.pwSubmitting.set(true);
    this.pwError.set(null);
    this.pwSuccess.set(false);
    try {
      await this.auth.updatePassword(currentPassword, newPassword);
      this.pwSuccess.set(true);
      this.pwForm.reset();
    } catch (err: unknown) {
      this.pwError.set(errorMessage(err, 'Error al cambiar la contraseña'));
    } finally {
      this.pwSubmitting.set(false);
    }
  }

  // ── Apariencia del negocio (solo super_admin) ────────────────────────────
  readonly isSuperAdmin = computed(() => this.auth.role() === 'super_admin');
  readonly presets: readonly ThemePreset[] = THEME_PRESET_LIST;

  // Paleta de colores: cada array interno = una columna (tono), de claro a oscuro
  readonly COLOR_PALETTE: string[][] = [
    ['#FCA5A5', '#F87171', '#EF4444', '#DC2626', '#B91C1C', '#7F1D1D'],
    ['#FED7AA', '#FDBA74', '#F97316', '#EA580C', '#C2410C', '#7C2D12'],
    ['#FEF08A', '#FDE047', '#EAB308', '#CA8A04', '#A16207', '#713F12'],
    ['#BBF7D0', '#4ADE80', '#22C55E', '#16A34A', '#15803D', '#14532D'],
    ['#99F6E4', '#2DD4BF', '#14B8A6', '#0D9488', '#0F766E', '#134E4A'],
    ['#BAE6FD', '#60A5FA', '#3B82F6', '#2563EB', '#1D4ED8', '#1E3A8A'],
    ['#C4B5FD', '#A78BFA', '#8B5CF6', '#7C3AED', '#6D28D9', '#4C1D95'],
    ['#F0ABFC', '#E879F9', '#D946EF', '#C026D3', '#A21CAF', '#701A75'],
    ['#FDA4AF', '#FB7185', '#F43F5E', '#E11D48', '#BE123C', '#881337'],
    ['#CBD5E1', '#94A3B8', '#64748B', '#475569', '#334155', '#0F172A'],
  ];

  readonly selectedPreset = signal<ThemePresetKey>(
    (this.auth.businessTheme()?.preset ?? 'monochrome') as ThemePresetKey,
  );
  readonly customPrimary = signal(this.auth.businessTheme()?.customColors?.primary ?? '#3B82F6');
  readonly customAccent  = signal(this.auth.businessTheme()?.customColors?.accent  ?? '#60A5FA');

  readonly customPresetPreview = computed(() =>
    buildCustomPreset(this.customPrimary(), this.customAccent()),
  );
  readonly customPrimaryFg = computed(() => contrastColor(this.customPrimary()));
  readonly customAccentFg  = computed(() => contrastColor(this.customAccent()));

  readonly themeSubmitting = signal(false);
  readonly themeError      = signal<string | null>(null);
  readonly themeSuccess    = signal(false);

  selectPreset(key: ThemePresetKey): void {
    this.selectedPreset.set(key);
    this.themeSuccess.set(false);
    this.themeError.set(null);
  }

  setPrimaryColor(hex: string): void { this.customPrimary.set(hex); }
  setAccentColor(hex: string):  void { this.customAccent.set(hex); }

  async saveTheme(): Promise<void> {
    const businessId   = this.auth.businessId();
    const isSuperAdmin = this.isSuperAdmin();

    // super_admin no tiene business_id → guarda en localStorage personal.
    // admin normal → guarda en la DB del negocio.
    if ((!businessId && !isSuperAdmin) || this.themeSubmitting()) return;

    const theme: BusinessTheme =
      this.selectedPreset() === 'custom'
        ? { preset: 'custom', customColors: { primary: this.customPrimary(), accent: this.customAccent() } }
        : { preset: this.selectedPreset() };

    this.themeSubmitting.set(true);
    this.themeError.set(null);
    this.themeSuccess.set(false);
    try {
      if (businessId) {
        await this.businessService.updateTheme(businessId, theme);
        this.themeService.applyPreset(theme);
      } else {
        // super_admin: persiste en localStorage y aplica al DOM
        this.themeService.savePersonalPreset(theme);
        this.auth.businessTheme.set(theme);
      }
      this.themeSuccess.set(true);
    } catch (err: unknown) {
      this.themeError.set(errorMessage(err, 'Error al guardar la apariencia'));
    } finally {
      this.themeSubmitting.set(false);
    }
  }
}
