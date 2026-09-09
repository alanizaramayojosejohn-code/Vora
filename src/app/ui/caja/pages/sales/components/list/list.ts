import { ChangeDetectionStrategy, Component, input, output } from '@angular/core';
import { CurrencyPipe, DatePipe } from '@angular/common';
import {
  OrderWithDetails,
  PAYMENT_METHOD_LABEL,
  PAYMENT_METHOD_STYLE,
  orderDestinationLabel,
  orderPaymentMethods,
  orderPrimaryLabel,
} from '../../../../../../models/order.model';
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
  readonly paymentStyle = PAYMENT_METHOD_STYLE;
  readonly primaryLabel = orderPrimaryLabel;
  // Los métodos salen de las líneas de pago: una venta dividida muestra los dos
  // (RF-14) y una cuenta pendiente no muestra ninguno, porque todavía no se
  // cobró nada.
  readonly paymentMethods = orderPaymentMethods;
  readonly destinationLabel = orderDestinationLabel;
}
