import { ChangeDetectionStrategy, Component, computed, inject, signal } from '@angular/core';
import { ActivatedRoute, Router } from '@angular/router';
import { OrderWithDetails, orderPrimaryLabel } from '../../../../../models/order.model';
import { OrderService } from '../../../../../services/order/order.service';
import { OrderQueryService } from '../../../../../services/order/query.service';
import { errorMessage } from '../../../../../utilities/error-message';
import { OrderInvoiceComponent } from '../components/invoice/invoice';
import { SalesListComponent } from '../components/list/list';

const PAGE_SIZE = 15;

@Component({
  selector: 'app-caja-sales',
  imports: [SalesListComponent, OrderInvoiceComponent],
  templateUrl: './component.html',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class CajaSalesContainerComponent {
  private readonly orderService = inject(OrderService);
  private readonly orderQuery = inject(OrderQueryService);
  private readonly router = inject(Router);
  private readonly route = inject(ActivatedRoute);

  readonly orders = signal<OrderWithDetails[]>([]);
  readonly loading = signal(false);
  readonly page = signal(1);

  readonly totalPages = computed(() => Math.max(1, Math.ceil(this.orders().length / PAGE_SIZE)));
  readonly paginatedOrders = computed(() => {
    const p = this.page();
    return this.orders().slice((p - 1) * PAGE_SIZE, p * PAGE_SIZE);
  });
  readonly pageNumbers = computed(() =>
    Array.from({ length: this.totalPages() }, (_, i) => i + 1),
  );

  // Invoice modal
  readonly invoiceOrder = signal<OrderWithDetails | null>(null);

  // Cancel modal
  readonly cancelling = signal<OrderWithDetails | null>(null);
  readonly cancellingError = signal<string | null>(null);
  readonly cancellingSubmitting = signal(false);
  readonly cancelReason = signal('');
  readonly cancelReasonTouched = signal(false);

  readonly canConfirmCancel = computed(() => {
    if (this.cancellingSubmitting()) return false;
    return this.cancelReason().trim().length > 0;
  });

  readonly cancellingLabel = computed(() => {
    const o = this.cancelling();
    if (!o) return null;
    return orderPrimaryLabel(o);
  });

  readonly cancellingInitials = computed(() => {
    const label = this.cancellingLabel();
    if (!label) return null;
    const parts = label.trim().split(/\s+/).filter(Boolean);
    if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
    return (parts[0][0] + parts[1][0]).toUpperCase();
  });

  readonly cancellingSublabel = computed(() => {
    const o = this.cancelling();
    if (!o) return null;
    const count = o.items.length;
    const itemsLabel = count > 1 ? `${count} ítems` : 'Productos';
    return o.client_label ? `${itemsLabel} · ${o.client_label}` : itemsLabel;
  });

  readonly cancellingAmount = computed(() => {
    const o = this.cancelling();
    return o ? `Bs ${Number(o.total_amount).toFixed(2)}` : null;
  });

  readonly cancellingDescription = computed(() => {
    const error = this.cancellingError();
    if (error) return error;
    const o = this.cancelling();
    if (!o) return '';
    const count = o.items.length;
    return count > 0
      ? `Se devolverá el stock de ${count} producto${count > 1 ? 's' : ''}.`
      : 'Esta acción no se puede deshacer.';
  });

  constructor() {
    void this.load();
  }

  async load(): Promise<void> {
    this.loading.set(true);
    try {
      const orders = await this.orderQuery.listOrders();
      this.orders.set(orders);
      this.page.set(1);
    } catch (err) {
      console.error('Error cargando órdenes', err);
    } finally {
      this.loading.set(false);
    }
  }

  goToNew(): void {
    void this.router.navigate(['new'], { relativeTo: this.route });
  }

  setPage(p: number): void {
    this.page.set(p);
  }

  showInvoice(order: OrderWithDetails): void {
    this.invoiceOrder.set(order);
  }

  closeInvoice(): void {
    this.invoiceOrder.set(null);
  }

  handleCancel(order: OrderWithDetails): void {
    this.cancelling.set(order);
    this.cancellingError.set(null);
    this.cancelReason.set('');
    this.cancelReasonTouched.set(false);
  }

  abortCancel(): void {
    if (this.cancellingSubmitting()) return;
    this.cancelling.set(null);
    this.cancellingError.set(null);
    this.cancelReason.set('');
    this.cancelReasonTouched.set(false);
  }

  async confirmCancel(): Promise<void> {
    const order = this.cancelling();
    const reason = this.cancelReason().trim();
    if (!order || !reason) {
      this.cancelReasonTouched.set(true);
      return;
    }
    this.cancellingSubmitting.set(true);
    this.cancellingError.set(null);
    try {
      await this.orderService.cancelOrder(order.id, reason);
      this.cancelling.set(null);
      await this.load();
    } catch (err: unknown) {
      this.cancellingError.set(errorMessage(err, 'Error al cancelar la orden'));
    } finally {
      this.cancellingSubmitting.set(false);
    }
  }
}
