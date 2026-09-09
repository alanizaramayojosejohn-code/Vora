import { ChangeDetectionStrategy, Component, computed, effect, input, output, signal } from '@angular/core';
import { CurrencyPipe } from '@angular/common';
import { PaymentMethod, PAYMENT_METHOD_LABEL } from '../../../../../../models/order.model';
import { PaymentLine, validatePaymentSplit } from '../../../../../../models/payment-split.model';
import { FormModalComponent } from '../../../../../shared/form-modal.component';
import { PaymentLinesComponent } from '../payment-lines/payment-lines';

// Cobro de un pedido pendiente. El monto ya está cerrado —es el total de la
// cuenta— y lo único que se decide acá es cómo se reparte entre métodos.
@Component({
  selector: 'app-settle-modal',
  imports: [CurrencyPipe, FormModalComponent, PaymentLinesComponent],
  templateUrl: './settle-modal.html',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class SettleModalComponent {
  readonly open = input<boolean>(false);
  readonly title = input<string>('Cobrar cuenta');
  readonly total = input<number>(0);
  readonly submitting = input<boolean>(false);
  readonly errorMessage = input<string | null>(null);

  readonly confirmed = output<PaymentLine[]>();
  readonly cancelled = output<void>();

  readonly methods: PaymentMethod[] = ['cash', 'card', 'qr'];
  readonly methodLabel = PAYMENT_METHOD_LABEL;

  readonly splitMode = signal(false);
  readonly simpleMethod = signal<PaymentMethod>('cash');
  readonly lines = signal<PaymentLine[]>([]);

  readonly check = computed(() => validatePaymentSplit(this.lines(), this.total()));

  readonly canConfirm = computed(() => {
    if (this.submitting()) return false;
    return this.splitMode() ? this.check().valid : true;
  });

  constructor() {
    // Cada vez que se abre, el reparto arranca de cero: dejar cargadas las
    // líneas de la cuenta anterior es la forma más fácil de cobrar mal.
    effect(() => {
      if (this.open()) {
        this.splitMode.set(false);
        this.simpleMethod.set('cash');
        this.lines.set([{ method: 'cash', amount: this.total() }]);
      }
    });
  }

  setSplitMode(split: boolean): void {
    this.splitMode.set(split);
    if (split) {
      this.lines.set([{ method: this.simpleMethod(), amount: this.total() }]);
    }
  }

  setSimpleMethod(method: PaymentMethod): void {
    this.simpleMethod.set(method);
  }

  onConfirm(): void {
    if (!this.canConfirm()) return;
    if (this.splitMode()) {
      this.confirmed.emit(this.lines());
      return;
    }
    const total = this.total();
    this.confirmed.emit(total > 0 ? [{ method: this.simpleMethod(), amount: total }] : []);
  }
}
