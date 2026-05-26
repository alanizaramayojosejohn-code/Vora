import { ChangeDetectionStrategy, Component, computed, effect, inject, input, output } from '@angular/core';
import { FormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { Employee } from '../../../../../../models/employee.model';
import { CreateEmployeeInput } from '../../../../../../services/staff/staff.service';

@Component({
  selector: 'app-admin-staff-form',
  imports: [ReactiveFormsModule],
  templateUrl: './form.html',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class StaffFormComponent {
  private readonly fb = inject(FormBuilder);

  readonly value = input<Employee | null>(null);
  readonly submitting = input<boolean>(false);
  readonly errorMessage = input<string | null>(null);
  readonly submitForm = output<CreateEmployeeInput>();
  readonly cancel = output<void>();

  readonly isEdit = computed(() => this.value() !== null);

  readonly form = this.fb.nonNullable.group({
    name: ['', [Validators.required, Validators.minLength(2)]],
    ci: ['', [Validators.required, Validators.minLength(3)]],
    phone: [''],
    position: ['', Validators.required],
    salary: [0, [Validators.required, Validators.min(0)]],
    hired_at: ['', Validators.required],
  });

  constructor() {
    effect(() => {
      const v = this.value();
      if (v) {
        this.form.reset({
          name: v.name,
          ci: v.ci,
          phone: v.phone ?? '',
          position: v.position,
          salary: v.salary,
          hired_at: v.hired_at.slice(0, 10),
        });
      } else {
        this.form.reset({ name: '', ci: '', phone: '', position: '', salary: 0, hired_at: '' });
      }
    });
  }

  onSubmit(): void {
    if (this.form.invalid || this.submitting()) return;
    const raw = this.form.getRawValue();
    const phone = raw.phone.trim();
    this.submitForm.emit({
      name: raw.name.trim(),
      ci: raw.ci.trim(),
      phone: phone.length > 0 ? phone : null,
      position: raw.position.trim(),
      salary: raw.salary,
      hired_at: raw.hired_at,
    });
  }
}
