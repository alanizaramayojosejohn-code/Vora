import { ChangeDetectionStrategy, Component, computed, effect, inject, input, output, signal } from '@angular/core';
import { FormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { Business, BusinessType } from '../../../../../../models/business.model';
import { BusinessTheme, DEFAULT_THEME, THEME_PRESET_LIST, ThemePreset, ThemePresetKey } from '../../../../../../services/theme/theme.presets';

const UUID_REGEX = /^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$/;

// Shape unificado que emite el form. Los campos de admin solo se llenan en create.
// theme = solo el preset (paleta del negocio). El mode (light/dark/system) es
// preferencia del USUARIO en su navegador, no se asigna desde aca.
export interface BusinessFormValue {
  businessName: string;
  businessType: BusinessType;
  adminUserId: string;
  adminName: string;
  adminCi: string;
  services: string[];
  theme: BusinessTheme;
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

  readonly value = input<Business | null>(null);
  readonly submitting = input<boolean>(false);
  readonly errorMessage = input<string | null>(null);
  readonly submitForm = output<BusinessFormValue>();
  readonly cancel = output<void>();

  readonly isEdit = computed(() => this.value() !== null);

  readonly presets: readonly ThemePreset[] = THEME_PRESET_LIST;

  readonly form = this.fb.nonNullable.group({
    businessName: ['', [Validators.required, Validators.minLength(2)]],
    businessType: ['gym' as BusinessType, [Validators.required]],
    adminUserId: ['', [Validators.required, Validators.pattern(UUID_REGEX)]],
    adminName: ['', [Validators.required, Validators.minLength(2)]],
    adminCi: ['', [Validators.required]],
    services: [''],
    themePreset: ['monochrome' as ThemePresetKey, [Validators.required]],
  });

  private readonly typeValue = signal<BusinessType>(this.form.controls.businessType.value);
  readonly isGym = computed(() => this.typeValue() === 'gym');

  private readonly presetValue = signal<ThemePresetKey>(this.form.controls.themePreset.value);
  readonly selectedPreset = computed(() => this.presetValue());

  constructor() {
    this.form.controls.businessType.valueChanges.subscribe((v) => {
      if (v) this.typeValue.set(v);
    });
    this.form.controls.themePreset.valueChanges.subscribe((v) => {
      if (v) this.presetValue.set(v);
    });

    effect(() => {
      const v = this.value();
      if (v) {
        this.form.controls.adminUserId.disable({ emitEvent: false });
        this.form.controls.adminName.disable({ emitEvent: false });
        this.form.controls.adminCi.disable({ emitEvent: false });
        this.form.controls.services.disable({ emitEvent: false });
        const theme = v.theme ?? DEFAULT_THEME;
        this.form.reset({
          businessName: v.name,
          businessType: v.type,
          adminUserId: '', adminName: '', adminCi: '', services: '',
          themePreset: theme.preset,
        });
        this.typeValue.set(v.type);
        this.presetValue.set(theme.preset);
      } else {
        this.form.controls.adminUserId.enable({ emitEvent: false });
        this.form.controls.adminName.enable({ emitEvent: false });
        this.form.controls.adminCi.enable({ emitEvent: false });
        this.form.controls.services.enable({ emitEvent: false });
        this.form.reset({
          businessName: '', businessType: 'gym',
          adminUserId: '', adminName: '', adminCi: '', services: '',
          themePreset: DEFAULT_THEME.preset,
        });
        this.typeValue.set('gym');
        this.presetValue.set(DEFAULT_THEME.preset);
      }
    });
  }

  selectPreset(key: ThemePresetKey): void {
    this.form.controls.themePreset.setValue(key);
    this.form.controls.themePreset.markAsDirty();
  }

  onSubmit(): void {
    if (this.form.invalid || this.submitting()) return;
    const raw = this.form.getRawValue();
    const services = raw.businessType === 'gym'
      ? raw.services.split(',').map((s) => s.trim()).filter((s) => s.length > 0)
      : [];
    this.submitForm.emit({
      businessName: raw.businessName.trim(),
      businessType: raw.businessType,
      adminUserId: raw.adminUserId.trim(),
      adminName: raw.adminName.trim(),
      adminCi: raw.adminCi.trim(),
      services,
      theme: { preset: raw.themePreset },
    });
  }
}
