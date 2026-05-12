import { ChangeDetectionStrategy, Component, computed, inject, signal } from '@angular/core';
import { ActivatedRoute, Router } from '@angular/router';
import { OrderWithDetails, orderPrimaryLabel, orderPrimaryType } from '../../../../../models/order.model';
import { OrderService } from '../../../../../services/order/order.service';
import { OrderQueryService } from '../../../../../services/order/query.service';
import { errorMessage } from '../../../../../utilities/error-message';
import { ConfirmDeleteModalComponent } from '../../../../shared/confirm-delete-modal.component';
import { OrderInvoiceComponent } from '../components/invoice/invoice';
import { SalesListComponent } from '../components/list/list';

const PAGE_SIZE = 15;

@Component({
  selector: 'app-caja-sales',
  imports: [ConfirmDeleteModalComponent, SalesListComponent, OrderInvoiceComponent],
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
    const type = orderPrimaryType(o) === 'product' ? 'Productos' : 'Membresía';
    const count = o.items.length;
    const itemsLabel = count > 1 ? `${count} ítems` : type;
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
    const products = o.items.filter((i) => i.type === 'product');
    const memberships = o.items.filter((i) => i.type === 'membership');
    const parts: string[] = [];
    if (products.length > 0) {
      parts.push(`Se devolverá el stock de ${products.length} producto${products.length > 1 ? 's' : ''}.`);
    }
    if (memberships.length > 0) {
      parts.push(`${memberships.length} membresía${memberships.length > 1 ? 's' : ''} quedarán desactivadas.`);
    }
    return parts.join(' ') || 'Esta acción no se puede deshacer.';
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
  }

  abortCancel(): void {
    if (this.cancellingSubmitting()) return;
    this.cancelling.set(null);
    this.cancellingError.set(null);
  }

  async confirmCancel(): Promise<void> {
    const order = this.cancelling();
    if (!order) return;
    this.cancellingSubmitting.set(true);
    this.cancellingError.set(null);
    try {
      await this.orderService.cancelOrder(order.id);
      this.cancelling.set(null);
      await this.load();
    } catch (err: unknown) {
      this.cancellingError.set(errorMessage(err, 'Error al cancelar la orden'));
    } finally {
      this.cancellingSubmitting.set(false);
    }
  }
}
