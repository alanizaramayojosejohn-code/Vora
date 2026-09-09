import { ChangeDetectionStrategy, Component, computed, input, output } from '@angular/core';
import { CurrencyPipe } from '@angular/common';
import { PaymentMethod, PAYMENT_METHOD_LABEL } from '../../../../../../models/order.model';
import {
  PaymentLine,
  remainingAmount,
  validatePaymentSplit,
} from '../../../../../../models/payment-split.model';

// Editor de las líneas de un pago dividido. No guarda estado: el arreglo vive
// en quien lo usa (la pantalla de venta para un cobro inmediato, el modal de
// cobro para saldar un pendiente) y acá solo se edita y se valida.
@Component({
  selector: 'app-payment-lines',
  imports: [CurrencyPipe],
  templateUrl: './payment-lines.html',
  // Sin esto el host es inline y el espaciado vertical del contenedor no lo
  // separa de lo que viene abajo: las líneas quedan pegadas al campo siguiente.
  host: { class: 'block' },
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class PaymentLinesComponent {
  readonly lines = input.required<PaymentLine[]>();
  readonly total = input.required<number>();
  readonly disabled = input<boolean>(false);
  readonly linesChange = output<PaymentLine[]>();

  readonly methods: PaymentMethod[] = ['cash', 'card', 'qr'];
  readonly methodLabel = PAYMENT_METHOD_LABEL;

  readonly check = computed(() => validatePaymentSplit(this.lines(), this.total()));
  readonly remaining = computed(() => remainingAmount(this.lines(), this.total()));

  addLine(): void {
    // La línea nueva viene con lo que falta ya cargado: el caso normal —dos
    // métodos, el segundo por el resto— queda resuelto sin sacar la cuenta.
    const used = new Set(this.lines().map((l) => l.method));
    const method = this.methods.find((m) => !used.has(m)) ?? 'cash';
    this.linesChange.emit([...this.lines(), { method, amount: this.remaining() }]);
  }

  removeLine(index: number): void {
    this.linesChange.emit(this.lines().filter((_, i) => i !== index));
  }

  setMethod(index: number, method: string): void {
    this.linesChange.emit(
      this.lines().map((l, i) => (i === index ? { ...l, method: method as PaymentMethod } : l)),
    );
  }

  setAmount(index: number, value: number): void {
    const amount = Number.isFinite(value) ? Math.max(0, value) : 0;
    this.linesChange.emit(this.lines().map((l, i) => (i === index ? { ...l, amount } : l)));
  }
}
