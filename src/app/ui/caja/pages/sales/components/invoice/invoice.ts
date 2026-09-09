import { ChangeDetectionStrategy, Component, computed, ElementRef, inject, input, output } from '@angular/core';
import { CurrencyPipe, DatePipe } from '@angular/common';
import { AuthService } from '../../../../../../services/auth/auth.service';
import {
  OrderWithDetails,
  orderDestinationLabel,
  orderPaymentLabel,
  PAYMENT_METHOD_LABEL,
} from '../../../../../../models/order.model';

@Component({
  selector: 'app-order-invoice',
  imports: [CurrencyPipe, DatePipe],
  templateUrl: './invoice.html',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class OrderInvoiceComponent {
  private readonly auth = inject(AuthService);
  private readonly elementRef = inject(ElementRef);

  readonly order = input.required<OrderWithDetails>();
  readonly close = output<void>();

  readonly businessName = computed(() => this.auth.businessName() ?? 'Vora');
  readonly businessInitial = computed(() => (this.businessName()[0] ?? 'V').toUpperCase());

  readonly orderNumber = computed(() => this.order().id.replace(/-/g, '').slice(-8).toUpperCase());

  // "Efectivo/QR" cuando el cobro se repartió, "Pendiente" si la cuenta sigue
  // abierta (RF-14).
  readonly paymentLabel = computed(() => orderPaymentLabel(this.order()));
  readonly destinationLabel = computed(() => orderDestinationLabel(this.order()));
  readonly paymentMethodLabels = PAYMENT_METHOD_LABEL;

  readonly subtotal = computed(() =>
    this.order().items.reduce((s, i) => s + i.unit_price * i.quantity, 0),
  );

  print(): void {
    const area = this.elementRef.nativeElement.querySelector('.invoice-print-area') as HTMLElement | null;
    if (!area) { window.print(); return; }

    const stylesheets = Array.from(document.querySelectorAll('link[rel="stylesheet"], style'))
      .map((s) => s.outerHTML)
      .join('\n');

    const win = window.open('', '_blank', 'width=640,height=900,menubar=no,toolbar=no,status=no');
    if (!win) { window.print(); return; }

    win.document.write(`<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <title>Factura · ${this.orderNumber()}</title>
  ${stylesheets}
  <style>
    body { background: white; margin: 0; padding: 24px; }
    .invoice-print-area {
      position: static !important;
      inset: auto !important;
      max-height: none !important;
      border: none !important;
      border-radius: 0 !important;
      box-shadow: none !important;
      width: 100% !important;
      max-width: 480px;
      margin: 0 auto;
      /* En pantalla el comprobante se pinta con el color del tema; en papel
         va sobre blanco. Se anulan las dos capas de surface-solid, no solo
         el color, o la de background-image seguiría tiñendo la hoja. */
      background: white !important;
      background-image: none !important;
      /* La animación de entrada no tiene sentido en la ventana de impresión
         y podría capturarse a mitad de camino. */
      animation: none !important;
    }
    .print\\:hidden { display: none !important; }
  </style>
</head>
<body>
  ${area.outerHTML}
  <script>
    window.onload = function() {
      window.print();
      window.onafterprint = function() { window.close(); };
    };
  <\/script>
</body>
</html>`);
    win.document.close();
  }
}
