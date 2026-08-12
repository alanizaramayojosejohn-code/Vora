import { CurrencyPipe, DatePipe } from '@angular/common';
import { ChangeDetectionStrategy, Component, computed, input, output } from '@angular/core';
import { BusinessWithSubscription } from '../../../../../../services/subscription/subscription.service';
import {
  PAYMENT_METHOD_LABELS,
  PAYMENT_METHOD_STYLE,
  SubscriptionPayment,
} from '../../../../../../models/subscription.model';

@Component({
  selector: 'app-saas-subscription-payments-history',
  imports: [DatePipe, CurrencyPipe],
  templateUrl: './payments-history.html',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class SubscriptionPaymentsHistoryComponent {
  readonly item = input.required<BusinessWithSubscription>();
  readonly payments = input<SubscriptionPayment[]>([]);
  readonly loading = input<boolean>(false);
  readonly close = output<void>();
  readonly addPayment = output<void>();
  readonly deletePayment = output<SubscriptionPayment>();

  readonly methodLabels = PAYMENT_METHOD_LABELS;
  readonly methodStyle = PAYMENT_METHOD_STYLE;

  readonly total = computed(() => this.payments().reduce((acc, p) => acc + p.amount, 0));
}
