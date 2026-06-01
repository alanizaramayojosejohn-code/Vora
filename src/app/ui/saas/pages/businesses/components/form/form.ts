import {
  ChangeDetectionStrategy,
  Component,
  computed,
  effect,
  inject,
  input,
  output,
  signal,
} from '@angular/core';
import { FormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { Business, BusinessOwner } from '../../../../../../models/business.model';
import { BusinessSubscription, PLAN_FEES, PLAN_LABELS, PlanType } from '../../../../../../models/subscription.model';
import {
  buildCustomPreset,
  BusinessTheme,
  contrastColor,
  DEFAULT_THEME,
  THEME_PRESET_LIST,
  ThemePreset,
  ThemePresetKey,
} from '../../../../../../services/theme/theme.presets';

const UUID_REGEX = /^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$/;

const PLAN_DESCRIPTIONS: Record<PlanType, string> = {
  basico:     'Funciones esenciales para empezar',
  pro:        'Más herramientas para crecer',
  enterprise: 'Acceso completo y soporte prioritario',
  custom:     'Tarifa negociada con el negocio',
};

export interface BusinessFormValue {
  businessName: string;
  adminUserId:  string;
  adminName:    string;
  adminCi:      string;
  theme:        BusinessTheme;
  logoFile:     File | null;
  removeLogo:   boolean;
  plan:         { plan_type: PlanType; monthly_fee: number } | null;
  owner:        BusinessOwner | null;
}

@Component({
  selector: 'app-saas-businesses-form',
  imports: [ReactiveFormsModule],
  templateUrl: './form.html',
  styleUrl: './form.css',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class BusinessesFormComponent {
  private readonly fb = inject(FormBuilder);

  readonly value        = input<Business | null>(null);
  readonly subscription = input<BusinessSubscription | null>(null);
  readonly submitting   = input<boolean>(false);
  readonly errorMessage = input<string | null>(null);
  readonly submitForm   = output<BusinessFormValue>();
  readonly cancel       = output<void>();

  readonly isEdit = computed(() => this.value() !== null);

  // ── Plan de suscripción ────────────────────────────────────────────────
  readonly PLAN_LABELS       = PLAN_LABELS;
  readonly PLAN_FEES         = PLAN_FEES;
  readonly PLAN_DESCRIPTIONS = PLAN_DESCRIPTIONS;
  readonly planOptions: (PlanType | null)[] = ['basico', 'pro', 'enterprise', 'custom', null];
  readonly selectedPlan = signal<PlanType | null>('basico');
  readonly customFee    = signal(150);

  selectPlan(plan: PlanType | null): void {
    this.selectedPlan.set(plan);
    if (plan && plan !== 'custom') this.customFee.set(PLAN_FEES[plan]);
  }

  readonly presets: readonly ThemePreset[] = THEME_PRESET_LIST;

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

  // Logo state
  readonly logoFile = signal<File | null>(null);
  readonly logoPreview = signal<string | null>(null);
  readonly removeLogo = signal(false);
  readonly existingLogoUrl = computed(() => this.value()?.logo_url ?? null);
  readonly showExistingLogo = computed(
    () => !this.removeLogo() && !this.logoPreview() && !!this.existingLogoUrl(),
  );

  readonly form = this.fb.nonNullable.group({
    businessName:     ['', [Validators.required, Validators.minLength(2)]],
    adminUserId:      ['', [Validators.required, Validators.pattern(UUID_REGEX)]],
    adminName:        ['', [Validators.required, Validators.minLength(2)]],
    adminCi:          ['', [Validators.required]],
    themePreset:      ['monochrome' as ThemePresetKey, [Validators.required]],
    customPrimary:    ['#3B82F6'],
    customAccent:     ['#60A5FA'],
    // Propietario / contacto del contrato
    ownerFirstName:   [''],
    ownerLastName:    [''],
    ownerPhone:       [''],
    ownerSex:         ['' as 'masculino' | 'femenino' | ''],
    ownerCity:        [''],
    businessLocation: [''],
  });

  readonly selectedPreset = signal<ThemePresetKey>(this.form.controls.themePreset.value);
  readonly customPrimary = signal(this.form.controls.customPrimary.value);
  readonly customAccent = signal(this.form.controls.customAccent.value);

  readonly customPresetPreview = computed(() =>
    buildCustomPreset(this.customPrimary(), this.customAccent()),
  );

  readonly customPrimaryFg = computed(() => contrastColor(this.customPrimary()));
  readonly customAccentFg = computed(() => contrastColor(this.customAccent()));

  constructor() {
    this.form.controls.themePreset.valueChanges.subscribe((v) => {
      if (v) this.selectedPreset.set(v as ThemePresetKey);
    });
    this.form.controls.customPrimary.valueChanges.subscribe((v) => {
      if (v) this.customPrimary.set(v);
    });
    this.form.controls.customAccent.valueChanges.subscribe((v) => {
      if (v) this.customAccent.set(v);
    });

    effect(() => {
      const v   = this.value();
      const sub = this.subscription();
      this.logoFile.set(null);
      this.logoPreview.set(null);
      this.removeLogo.set(false);

      if (v) {
        this.form.controls.adminUserId.disable({ emitEvent: false });
        this.form.controls.adminName.disable({ emitEvent: false });
        this.form.controls.adminCi.disable({ emitEvent: false });
        const theme = v.theme ?? DEFAULT_THEME;
        const customPrimary = theme.customColors?.primary ?? '#3B82F6';
        const customAccent  = theme.customColors?.accent  ?? '#60A5FA';
        const owner = v.owner;
        this.form.reset({
          businessName:     v.name,
          adminUserId:      '',
          adminName:        '',
          adminCi:          '',
          themePreset:      theme.preset,
          customPrimary,
          customAccent,
          ownerFirstName:   owner?.first_name        ?? '',
          ownerLastName:    owner?.last_name          ?? '',
          ownerPhone:       owner?.phone              ?? '',
          ownerSex:         owner?.sex                ?? '',
          ownerCity:        owner?.city               ?? '',
          businessLocation: owner?.business_location  ?? '',
        });
        this.selectedPreset.set(theme.preset);
        this.customPrimary.set(customPrimary);
        this.customAccent.set(customAccent);
        // Pre-cargar plan desde la suscripción existente
        if (sub) {
          this.selectedPlan.set(sub.plan_type);
          this.customFee.set(sub.monthly_fee);
        } else {
          this.selectedPlan.set(null);
        }
      } else {
        this.form.controls.adminUserId.enable({ emitEvent: false });
        this.form.controls.adminName.enable({ emitEvent: false });
        this.form.controls.adminCi.enable({ emitEvent: false });
        this.form.reset({
          businessName:     '',
          adminUserId:      '',
          adminName:        '',
          adminCi:          '',
          themePreset:      DEFAULT_THEME.preset,
          customPrimary:    '#3B82F6',
          customAccent:     '#60A5FA',
          ownerFirstName:   '',
          ownerLastName:    '',
          ownerPhone:       '',
          ownerSex:         '',
          ownerCity:        '',
          businessLocation: '',
        });
        this.selectedPreset.set(DEFAULT_THEME.preset);
        this.customPrimary.set('#3B82F6');
        this.customAccent.set('#60A5FA');
      }
    });
  }

  selectPreset(key: ThemePresetKey): void {
    this.form.controls.themePreset.setValue(key);
    this.form.controls.themePreset.markAsDirty();
  }

  onLogoFileChange(event: Event): void {
    const input = event.target as HTMLInputElement;
    const file = input.files?.[0] ?? null;
    if (!file) return;
    this.logoFile.set(file);
    this.removeLogo.set(false);
    const reader = new FileReader();
    reader.onload = (e) => this.logoPreview.set(e.target?.result as string);
    reader.readAsDataURL(file);
  }

  clearLogo(): void {
    this.logoFile.set(null);
    this.logoPreview.set(null);
  }

  removeExistingLogo(): void {
    this.removeLogo.set(true);
    this.logoFile.set(null);
    this.logoPreview.set(null);
  }

  onSubmit(): void {
    if (this.form.invalid || this.submitting()) return;
    const raw = this.form.getRawValue();
    const theme: BusinessTheme =
      raw.themePreset === 'custom'
        ? { preset: 'custom', customColors: { primary: raw.customPrimary, accent: raw.customAccent } }
        : { preset: raw.themePreset };

    const ownerData: BusinessOwner = {
      first_name:        raw.ownerFirstName.trim(),
      last_name:         raw.ownerLastName.trim(),
      phone:             raw.ownerPhone.trim(),
      sex:               raw.ownerSex as 'masculino' | 'femenino' | '',
      city:              raw.ownerCity.trim(),
      business_location: raw.businessLocation.trim(),
    };
    const hasOwner = Object.values(ownerData).some((v) => v !== '');

    const plan = this.selectedPlan();
    this.submitForm.emit({
      businessName: raw.businessName.trim(),
      adminUserId:  raw.adminUserId.trim(),
      adminName:    raw.adminName.trim(),
      adminCi:      raw.adminCi.trim(),
      theme,
      logoFile:     this.logoFile(),
      removeLogo:   this.removeLogo(),
      plan: plan
        ? { plan_type: plan, monthly_fee: plan === 'custom' ? this.customFee() : PLAN_FEES[plan] }
        : null,
      owner: hasOwner ? ownerData : null,
    });
  }
}
