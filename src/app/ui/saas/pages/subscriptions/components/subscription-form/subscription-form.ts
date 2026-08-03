import { ChangeDetectionStrategy, Component, computed, effect, inject, input, output, signal } from '@angular/core';
import { FormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { Business } from '../../../../../../models/business.model';
import { BusinessSubscription, PLAN_FEES, PLAN_LABELS, PlanType } from '../../../../../../models/subscription.model';
import { UpsertSubscriptionInput } from '../../../../../../services/subscription/subscription.service';

const PLAN_DESCRIPTIONS: Record<PlanType, string> = {
  caja:    'Punto de venta y ventas offline',
  negocio: 'Inventario, compras, reportes y personal',
  custom:  'Tarifa negociada con el negocio',
};

@Component({
  selector: 'app-saas-subscription-form',
  imports: [ReactiveFormsModule],
  templateUrl: './subscription-form.html',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class SubscriptionFormComponent {
  private readonly fb = inject(FormBuilder);

  readonly business    = input.required<Business>();
  readonly subscription = input<BusinessSubscription | null>(null);
  readonly submitting   = input<boolean>(false);
  readonly errorMessage = input<string | null>(null);
  readonly submitForm   = output<UpsertSubscriptionInput>();
  readonly cancel       = output<void>();

  readonly isEdit = computed(() => this.subscription() !== null);

  readonly PLAN_LABELS       = PLAN_LABELS;
  readonly PLAN_FEES         = PLAN_FEES;
  readonly PLAN_DESCRIPTIONS = PLAN_DESCRIPTIONS;
  readonly planOptions: PlanType[] = ['caja', 'negocio', 'custom'];

  readonly selectedPlan = signal<PlanType>('caja');

  readonly form = this.fb.nonNullable.group({
    plan_type:   ['caja' as PlanType, Validators.required],
    monthly_fee: [PLAN_FEES.caja,     [Validators.required, Validators.min(1)]],
    start_date:  ['',                 Validators.required],
    end_date:    ['',                 Validators.required],
  });

  constructor() {
    effect(() => {
      const sub = this.subscription();
      if (sub) {
        const plan = sub.plan_type ?? 'custom';
        this.selectedPlan.set(plan);
        this.form.reset({
          plan_type:   plan,
          monthly_fee: sub.monthly_fee,
          start_date:  sub.start_date.slice(0, 10),
          end_date:    sub.end_date.slice(0, 10),
        });
      } else {
        const today     = new Date().toISOString().slice(0, 10);
        const nextMonth = new Date();
        nextMonth.setMonth(nextMonth.getMonth() + 1);
        this.selectedPlan.set('caja');
        this.form.reset({
          plan_type:   'caja',
          monthly_fee: PLAN_FEES.caja,
          start_date:  today,
          end_date:    nextMonth.toISOString().slice(0, 10),
        });
      }
    });
  }

  selectPlan(plan: PlanType): void {
    this.selectedPlan.set(plan);
    this.form.controls.plan_type.setValue(plan);
    if (plan !== 'custom') {
      this.form.controls.monthly_fee.setValue(PLAN_FEES[plan]);
    }
  }

  onSubmit(): void {
    if (this.form.invalid || this.submitting()) return;
    const raw = this.form.getRawValue();
    this.submitForm.emit({
      business_id: this.business().id,
      plan_type:   raw.plan_type,
      monthly_fee: raw.monthly_fee,
      start_date:  raw.start_date,
      end_date:    raw.end_date,
    });
  }
}
