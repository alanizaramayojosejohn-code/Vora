import { ChangeDetectionStrategy, Component, computed, inject, input, output, signal } from '@angular/core';
import { FormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { BusinessType } from '../../../../../../models/business.model';
import { CreateBusinessWithAdminInput } from '../../../../../../services/business/business.service';

const UUID_REGEX = /^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$/;

@Component({
  selector: 'app-saas-businesses-form',
  imports: [ReactiveFormsModule],
  templateUrl: './form.html',
  styleUrl: './form.css',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class BusinessesFormComponent {
  private readonly fb = inject(FormBuilder);

  readonly submitting = input<boolean>(false);
  readonly errorMessage = input<string | null>(null);
  readonly submitForm = output<CreateBusinessWithAdminInput>();
  readonly cancel = output<void>();

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
