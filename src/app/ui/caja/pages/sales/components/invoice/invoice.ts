import { ChangeDetectionStrategy, Component, computed, ElementRef, inject, input, output } from '@angular/core';
import { CurrencyPipe, DatePipe } from '@angular/common';
import { AuthService } from '../../../../../../services/auth/auth.service';
import { OrderWithDetails, PAYMENT_METHOD_LABEL } from '../../../../../../models/order.model';

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

  readonly paymentLabel = computed(() => PAYMENT_METHOD_LABEL[this.order().payment_method]);

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
