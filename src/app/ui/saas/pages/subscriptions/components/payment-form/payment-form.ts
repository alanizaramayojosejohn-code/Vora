import { DecimalPipe } from '@angular/common';
import { ChangeDetectionStrategy, Component, effect, inject, input, output, signal } from '@angular/core';
import { FormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { PaymentMethod, PAYMENT_METHOD_LABELS } from '../../../../../../models/subscription.model';
import { BusinessWithSubscription, CreateSubscriptionPaymentInput } from '../../../../../../services/subscription/subscription.service';

export interface PaymentFormOutput extends CreateSubscriptionPaymentInput {
  months_count: number;
}

const MONTH_NAMES = [
  'Enero', 'Febrero', 'Marzo', 'Abril', 'Mayo', 'Junio',
  'Julio', 'Agosto', 'Septiembre', 'Octubre', 'Noviembre', 'Diciembre',
];

@Component({
  selector: 'app-saas-subscription-payment-form',
  imports: [ReactiveFormsModule, DecimalPipe],
  templateUrl: './payment-form.html',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class SubscriptionPaymentFormComponent {
  private readonly fb = inject(FormBuilder);

  readonly item         = input.required<BusinessWithSubscription>();
  readonly submitting   = input<boolean>(false);
  readonly errorMessage = input<string | null>(null);
  readonly submitForm   = output<PaymentFormOutput>();
  readonly cancel       = output<void>();

  readonly PAYMENT_METHOD_LABELS = PAYMENT_METHOD_LABELS;
  readonly paymentMethods: PaymentMethod[] = ['efectivo', 'tarjeta', 'qr', 'transferencia'];

  readonly selectedMethod = signal<PaymentMethod>('efectivo');
  readonly monthsCount    = signal(1);

  readonly form = this.fb.nonNullable.group({
    amount:         [0, [Validators.required, Validators.min(1)]],
    period_label:   ['', Validators.required],
    paid_at:        [new Date().toISOString().slice(0, 10), Validators.required],
    payment_method: ['efectivo' as PaymentMethod, Validators.required],
    is_late:        [false],
    notes:          [''],
  });

  constructor() {
    effect(() => {
      const months = this.monthsCount();
      const sub    = this.item().subscription;
      const fee    = sub?.monthly_fee ?? 0;
      this.form.controls.amount.setValue(fee * months, { emitEvent: false });
      this.form.controls.period_label.setValue(
        this.buildPeriodLabel(months, sub?.end_date ?? null),
        { emitEvent: false },
      );
    });
  }

  private buildPeriodLabel(months: number, endDate: string | null): string {
    let start: Date;
    if (endDate) {
      start = new Date(endDate + 'T00:00:00');
      start.setDate(start.getDate() + 1);
    } else {
      start = new Date();
      start.setDate(1);
    }
    if (months === 1) {
      return `${MONTH_NAMES[start.getMonth()]} ${start.getFullYear()}`;
    }
    const end = new Date(start);
    end.setMonth(end.getMonth() + months - 1);
    if (start.getFullYear() === end.getFullYear()) {
      return `${MONTH_NAMES[start.getMonth()]} – ${MONTH_NAMES[end.getMonth()]} ${start.getFullYear()}`;
    }
    return `${MONTH_NAMES[start.getMonth()]} ${start.getFullYear()} – ${MONTH_NAMES[end.getMonth()]} ${end.getFullYear()}`;
  }

  incrementMonths(): void {
    if (this.monthsCount() < 12) this.monthsCount.update((n) => n + 1);
  }

  decrementMonths(): void {
    if (this.monthsCount() > 1) this.monthsCount.update((n) => n - 1);
  }

  selectMethod(method: PaymentMethod): void {
    this.selectedMethod.set(method);
    this.form.controls.payment_method.setValue(method);
  }

  onSubmit(): void {
    if (this.form.invalid || this.submitting()) return;
    const raw = this.form.getRawValue();
    const sub = this.item().subscription;
    if (!sub) return;
    const notes = raw.notes.trim();
    this.submitForm.emit({
      subscription_id: sub.id,
      business_id:     this.item().business.id,
      amount:          raw.amount,
      period_label:    raw.period_label.trim(),
      paid_at:         raw.paid_at,
      payment_method:  raw.payment_method,
      is_late:         raw.is_late,
      notes:           notes.length > 0 ? notes : null,
      months_count:    this.monthsCount(),
    });
  }
}
