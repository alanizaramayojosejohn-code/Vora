import { CurrencyPipe, DatePipe } from '@angular/common';
import { ChangeDetectionStrategy, Component, inject, signal } from '@angular/core';
import { RouterLink } from '@angular/router';
import { Acquisition } from '../../../../../models/acquisition.model';
import { PurchaseOrder } from '../../../../../models/purchase-order.model';
import { PurchasesService } from '../../../../../services/purchases/purchases.service';
import { errorMessage } from '../../../../../utilities/error-message';

@Component({
  selector: 'app-purchases-dashboard',
  imports: [RouterLink, CurrencyPipe, DatePipe],
  templateUrl: './component.html',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class PurchasesDashboardComponent {
  private readonly purchases = inject(PurchasesService);

  readonly acquisitions = signal<Acquisition[]>([]);
  readonly pendingOrders = signal<PurchaseOrder[]>([]);
  readonly loading = signal(true);
  readonly error = signal<string | null>(null);

  readonly receivingId = signal<string | null>(null);
  readonly cancellingId = signal<string | null>(null);
  readonly actionError = signal<string | null>(null);

  constructor() {
    void this.refresh();
  }

  async refresh(): Promise<void> {
    this.loading.set(true);
    this.error.set(null);
    try {
      const [acq, orders] = await Promise.all([
        this.purchases.listAcquisitions(10),
        this.purchases.listPurchaseOrders('pending'),
      ]);
      this.acquisitions.set(acq);
      this.pendingOrders.set(orders);
    } catch (err: unknown) {
      this.error.set(errorMessage(err, 'Error al cargar compras'));
    } finally {
      this.loading.set(false);
    }
  }

  async receiveOrder(orderId: string): Promise<void> {
    this.receivingId.set(orderId);
    this.actionError.set(null);
    try {
      await this.purchases.receivePurchaseOrder(orderId);
      await this.refresh();
    } catch (err: unknown) {
      this.actionError.set(errorMessage(err, 'Error al recibir pedido'));
    } finally {
      this.receivingId.set(null);
    }
  }

  async cancelOrder(orderId: string): Promise<void> {
    this.cancellingId.set(orderId);
    this.actionError.set(null);
    try {
      await this.purchases.cancelPurchaseOrder(orderId);
      await this.refresh();
    } catch (err: unknown) {
      this.actionError.set(errorMessage(err, 'Error al cancelar pedido'));
    } finally {
      this.cancellingId.set(null);
    }
  }

  formatItems(count: number): string {
    return count === 1 ? '1 producto' : `${count} productos`;
  }
}
