import { DatePipe } from '@angular/common';
import { ChangeDetectionStrategy, Component, inject, signal } from '@angular/core';
import { SubscriptionPayment } from '../../../../../models/subscription.model';
import {
  BusinessWithSubscription,
  SubscriptionService,
  UpsertSubscriptionInput,
} from '../../../../../services/subscription/subscription.service';
import { errorMessage } from '../../../../../utilities/error-message';
import { ConfirmDeleteModalComponent } from '../../../../shared/confirm-delete-modal.component';
import { PaymentFormOutput, SubscriptionPaymentFormComponent } from '../components/payment-form/payment-form';
import { SubscriptionPaymentsHistoryComponent } from '../components/payments-history/payments-history';
import { SubscriptionFormComponent } from '../components/subscription-form/subscription-form';
import { SubscriptionsListComponent } from '../components/list/list';

@Component({
  selector: 'app-saas-subscriptions',
  imports: [
    DatePipe,
    SubscriptionsListComponent,
    SubscriptionFormComponent,
    SubscriptionPaymentFormComponent,
    SubscriptionPaymentsHistoryComponent,
    ConfirmDeleteModalComponent,
  ],
  templateUrl: './component.html',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class SaasSubscriptionsContainerComponent {
  private readonly subscriptionService = inject(SubscriptionService);

  readonly items = signal<BusinessWithSubscription[]>([]);
  readonly loading = signal(false);

  // Configurar suscripción
  readonly configuringItem = signal<BusinessWithSubscription | null>(null);
  readonly configSubmitting = signal(false);
  readonly configError = signal<string | null>(null);

  // Panel de pagos
  readonly selectedItem = signal<BusinessWithSubscription | null>(null);
  readonly payments = signal<SubscriptionPayment[]>([]);
  readonly paymentsLoading = signal(false);
  readonly showPaymentForm = signal(false);
  readonly paymentSubmitting = signal(false);
  readonly paymentError = signal<string | null>(null);

  // Borrado de pago
  readonly deletingPayment = signal<SubscriptionPayment | null>(null);
  readonly deletingPaymentSubmitting = signal(false);
  readonly deletingPaymentError = signal<string | null>(null);

  constructor() {
    void this.refresh();
  }

  async refresh(): Promise<void> {
    this.loading.set(true);
    try {
      this.items.set(await this.subscriptionService.listBusinessesWithSubscriptions());
    } catch (err: unknown) {
      console.error('Error cargando suscripciones', err);
    } finally {
      this.loading.set(false);
    }
  }

  openConfigure(item: BusinessWithSubscription): void {
    this.configuringItem.set(item);
    this.configError.set(null);
  }

  closeConfigure(): void {
    this.configuringItem.set(null);
    this.configError.set(null);
  }

  async handleConfigure(input: UpsertSubscriptionInput): Promise<void> {
    this.configSubmitting.set(true);
    this.configError.set(null);
    try {
      await this.subscriptionService.upsertSubscription(input);
      this.configuringItem.set(null);
      await this.refresh();
    } catch (err: unknown) {
      this.configError.set(errorMessage(err, 'Error al guardar suscripción'));
    } finally {
      this.configSubmitting.set(false);
    }
  }

  async openPayments(item: BusinessWithSubscription): Promise<void> {
    this.selectedItem.set(item);
    this.showPaymentForm.set(false);
    this.paymentsLoading.set(true);
    try {
      this.payments.set(await this.subscriptionService.listPayments(item.business.id));
    } catch (err: unknown) {
      console.error('Error cargando pagos', err);
    } finally {
      this.paymentsLoading.set(false);
    }
  }

  closePayments(): void {
    this.selectedItem.set(null);
    this.payments.set([]);
    this.showPaymentForm.set(false);
  }

  async handlePayment(input: PaymentFormOutput): Promise<void> {
    this.paymentSubmitting.set(true);
    this.paymentError.set(null);
    try {
      const { months_count, ...paymentInput } = input;
      await this.subscriptionService.createPayment(paymentInput);

      // Extender la fecha de vencimiento por los meses pagados
      const sub = this.selectedItem()?.subscription;
      if (sub) {
        const newEnd = this.subscriptionService.nextEndDate(sub.end_date, months_count);
        await this.subscriptionService.extendSubscription(sub.id, newEnd);
      }

      this.showPaymentForm.set(false);
      await this.refresh();

      // Recargar pagos y actualizar el item seleccionado con datos frescos
      const refreshed = this.items().find((i) => i.business.id === input.business_id);
      if (refreshed) {
        this.selectedItem.set(refreshed);
        this.payments.set(await this.subscriptionService.listPayments(input.business_id));
      }
    } catch (err: unknown) {
      this.paymentError.set(errorMessage(err, 'Error al registrar pago'));
    } finally {
      this.paymentSubmitting.set(false);
    }
  }

  handleDeletePayment(p: SubscriptionPayment): void {
    this.deletingPayment.set(p);
    this.deletingPaymentError.set(null);
  }

  cancelDeletePayment(): void {
    if (this.deletingPaymentSubmitting()) return;
    this.deletingPayment.set(null);
    this.deletingPaymentError.set(null);
  }

  async confirmDeletePayment(): Promise<void> {
    const p = this.deletingPayment();
    if (!p) return;
    this.deletingPaymentSubmitting.set(true);
    this.deletingPaymentError.set(null);
    try {
      await this.subscriptionService.deletePayment(p.id);
      this.deletingPayment.set(null);
      const item = this.selectedItem();
      if (item) this.payments.set(await this.subscriptionService.listPayments(item.business.id));
    } catch (err: unknown) {
      this.deletingPaymentError.set(errorMessage(err, 'Error al eliminar pago'));
    } finally {
      this.deletingPaymentSubmitting.set(false);
    }
  }
}
