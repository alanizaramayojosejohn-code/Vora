import { ChangeDetectionStrategy, Component, computed, effect, inject, input, output, signal } from '@angular/core';
import { FormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { Business, BusinessType } from '../../../../../../models/business.model';

const UUID_REGEX = /^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$/;

// Shape unificado que emite el form. Los campos de admin solo se llenan en create.
export interface BusinessFormValue {
  businessName: string;
  businessType: BusinessType;
  adminUserId: string;
  adminName: string;
  adminCi: string;
  services: string[];
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

  readonly form = this.fb.nonNullable.group({
    businessName: ['', [Validators.required, Validators.minLength(2)]],
    businessType: ['gym' as BusinessType, [Validators.required]],
    adminUserId: ['', [Validators.required, Validators.pattern(UUID_REGEX)]],
    adminName: ['', [Validators.required, Validators.minLength(2)]],
    adminCi: ['', [Validators.required]],
    services: [''],
  });

  // Signal del control para reactividad en la plantilla (services solo aplica a gym).
  private readonly typeValue = signal<BusinessType>(this.form.controls.businessType.value);
  readonly isGym = computed(() => this.typeValue() === 'gym');

  constructor() {
    this.form.controls.businessType.valueChanges.subscribe((v) => {
      if (v) this.typeValue.set(v);
    });

    effect(() => {
      const v = this.value();
      if (v) {
        // Edit: deshabilita campos de admin para que pasen los validators.
        this.form.controls.adminUserId.disable({ emitEvent: false });
        this.form.controls.adminName.disable({ emitEvent: false });
        this.form.controls.adminCi.disable({ emitEvent: false });
        this.form.controls.services.disable({ emitEvent: false });
        this.form.reset({
          businessName: v.name,
          businessType: v.type,
          adminUserId: '', adminName: '', adminCi: '', services: '',
        });
        this.typeValue.set(v.type);
      } else {
        this.form.controls.adminUserId.enable({ emitEvent: false });
        this.form.controls.adminName.enable({ emitEvent: false });
        this.form.controls.adminCi.enable({ emitEvent: false });
        this.form.controls.services.enable({ emitEvent: false });
        this.form.reset({
          businessName: '', businessType: 'gym',
          adminUserId: '', adminName: '', adminCi: '', services: '',
        });
        this.typeValue.set('gym');
      }
    });
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
    });
  }
}
