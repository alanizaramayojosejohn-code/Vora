import { ChangeDetectionStrategy, Component, computed, inject, input, output } from '@angular/core';
import { DecimalPipe } from '@angular/common';
import { FormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { Client } from '../../../../../../models/client.model';
import { MembershipPlan } from '../../../../../../models/membership-plan.model';
import { MembershipOrderInput } from '../../../../../../services/order/order.service';

@Component({
  selector: 'app-caja-sales-membership-form',
  imports: [ReactiveFormsModule, DecimalPipe],
  templateUrl: './membership-form.html',
  styleUrl: './membership-form.css',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class SalesMembershipFormComponent {
  private readonly fb = inject(FormBuilder);

  readonly clients = input.required<Client[]>();
  readonly plans = input.required<MembershipPlan[]>();
  readonly submitting = input<boolean>(false);
  readonly errorMessage = input<string | null>(null);
  readonly submitForm = output<MembershipOrderInput>();
  readonly cancel = output<void>();

  readonly form = this.fb.nonNullable.group({
    client_id: ['', [Validators.required]],
    plan_id: ['', [Validators.required]],
    start_date: [this.today()],
  });

  readonly selectedPlan = computed<MembershipPlan | null>(() => {
    const id = this.form.controls.plan_id.value;
    return this.plans().find((p) => p.id === id) ?? null;
  });

  private today(): string {
    const now = new Date();
    const yyyy = now.getFullYear();
    const mm = String(now.getMonth() + 1).padStart(2, '0');
    const dd = String(now.getDate()).padStart(2, '0');
    return `${yyyy}-${mm}-${dd}`;
  }

  onSubmit(): void {
    if (this.form.invalid || this.submitting()) return;
    const raw = this.form.getRawValue();
    const startDate = raw.start_date.trim();
    this.submitForm.emit({
      client_id: raw.client_id,
      plan_id: raw.plan_id,
      start_date: startDate.length > 0 ? startDate : null,
    });
  }
}
