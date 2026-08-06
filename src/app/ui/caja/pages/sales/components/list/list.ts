import { ChangeDetectionStrategy, Component, input, output } from '@angular/core';
import { CurrencyPipe, DatePipe } from '@angular/common';
import { OrderWithDetails, PAYMENT_METHOD_LABEL, orderPrimaryLabel } from '../../../../../../models/order.model';
import { SkeletonRowsComponent } from '../../../../../shared/skeleton-rows.component';

@Component({
  selector: 'app-caja-sales-list',
  imports: [SkeletonRowsComponent, CurrencyPipe, DatePipe],
  templateUrl: './list.html',
  styleUrl: './list.css',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class SalesListComponent {
  readonly sales = input.required<OrderWithDetails[]>();
  readonly loading = input<boolean>(false);
  readonly cancel = output<OrderWithDetails>();
  readonly invoice = output<OrderWithDetails>();

  readonly paymentLabel = PAYMENT_METHOD_LABEL;
  readonly primaryLabel = orderPrimaryLabel;
}
