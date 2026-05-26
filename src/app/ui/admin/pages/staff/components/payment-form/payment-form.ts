import { ChangeDetectionStrategy, Component, inject, input, output } from '@angular/core';
import { FormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { Employee } from '../../../../../../models/employee.model';
import { CreatePaymentInput } from '../../../../../../services/staff/staff.service';

@Component({
  selector: 'app-admin-staff-payment-form',
  imports: [ReactiveFormsModule],
  templateUrl: './payment-form.html',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class StaffPaymentFormComponent {
  private readonly fb = inject(FormBuilder);

  readonly employee = input.required<Employee>();
  readonly submitting = input<boolean>(false);
  readonly errorMessage = input<string | null>(null);
  readonly submitForm = output<CreatePaymentInput>();
  readonly cancel = output<void>();

  readonly form = this.fb.nonNullable.group({
    amount: [0, [Validators.required, Validators.min(1)]],
    period_month: [new Date().getMonth() + 1, [Validators.required, Validators.min(1), Validators.max(12)]],
    period_year: [new Date().getFullYear(), [Validators.required, Validators.min(2000)]],
    paid_at: [new Date().toISOString().slice(0, 10), Validators.required],
    notes: [''],
  });

  readonly months = [
    { v: 1, l: 'Enero' }, { v: 2, l: 'Febrero' }, { v: 3, l: 'Marzo' },
    { v: 4, l: 'Abril' }, { v: 5, l: 'Mayo' }, { v: 6, l: 'Junio' },
    { v: 7, l: 'Julio' }, { v: 8, l: 'Agosto' }, { v: 9, l: 'Septiembre' },
    { v: 10, l: 'Octubre' }, { v: 11, l: 'Noviembre' }, { v: 12, l: 'Diciembre' },
  ];

  onSubmit(): void {
    if (this.form.invalid || this.submitting()) return;
    const raw = this.form.getRawValue();
    const notes = raw.notes.trim();
    this.submitForm.emit({
      employee_id: this.employee().id,
      amount: raw.amount,
      period_month: raw.period_month,
      period_year: raw.period_year,
      paid_at: raw.paid_at,
      notes: notes.length > 0 ? notes : null,
    });
  }
}
