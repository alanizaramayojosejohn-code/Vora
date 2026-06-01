import { ChangeDetectionStrategy, Component, computed, inject, signal } from '@angular/core';
import { DatePipe } from '@angular/common';
import { RouterLink } from '@angular/router';
import { PurchaseOrder } from '../../../../../models/purchase-order.model';
import { PurchasesService } from '../../../../../services/purchases/purchases.service';
import { errorMessage } from '../../../../../utilities/error-message';

type Bucket = 'overdue' | 'today' | 'week' | 'later' | 'unscheduled';

interface ScheduledOrder extends PurchaseOrder {
  bucket: Bucket;
}

const today = () => {
  const d = new Date();
  d.setHours(0, 0, 0, 0);
  return d;
};

function getBucket(expectedDate: string | null): Bucket {
  if (!expectedDate) return 'unscheduled';
  const d = new Date(expectedDate + 'T00:00:00');
  const t = today();
  const diffDays = Math.floor((d.getTime() - t.getTime()) / 86_400_000);
  if (diffDays < 0)  return 'overdue';
  if (diffDays === 0) return 'today';
  if (diffDays <= 7)  return 'week';
  return 'later';
}

const BUCKET_META: Record<Bucket, { label: string; color: string; dot: string }> = {
  overdue:     { label: 'Vencidos',        color: 'text-danger',  dot: 'bg-danger' },
  today:       { label: 'Hoy',             color: 'text-warning', dot: 'bg-warning' },
  week:        { label: 'Esta semana',      color: 'text-primary', dot: 'bg-primary' },
  later:       { label: 'Más adelante',     color: 'text-foreground-muted', dot: 'bg-foreground-faint' },
  unscheduled: { label: 'Sin fecha',        color: 'text-foreground-faint', dot: 'bg-border' },
};

const BUCKETS: Bucket[] = ['overdue', 'today', 'week', 'later', 'unscheduled'];

@Component({
  selector: 'app-purchases-schedule',
  imports: [RouterLink, DatePipe],
  templateUrl: './component.html',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class PurchasesScheduleComponent {
  private readonly purchases = inject(PurchasesService);

  readonly loading      = signal(true);
  readonly error        = signal<string | null>(null);
  readonly orders       = signal<ScheduledOrder[]>([]);
  readonly receivingId  = signal<string | null>(null);
  readonly cancellingId = signal<string | null>(null);
  readonly actionError  = signal<string | null>(null);

  readonly buckets = BUCKETS;
  readonly bucketMeta = BUCKET_META;

  readonly grouped = computed<Record<Bucket, ScheduledOrder[]>>(() => {
    const map = { overdue: [], today: [], week: [], later: [], unscheduled: [] } as Record<Bucket, ScheduledOrder[]>;
    for (const o of this.orders()) map[o.bucket].push(o);
    return map;
  });

  constructor() { void this.refresh(); }

  async refresh(): Promise<void> {
    this.loading.set(true);
    this.error.set(null);
    try {
      const raw = await this.purchases.listPurchaseOrders('pending');
      this.orders.set(raw.map(o => ({ ...o, bucket: getBucket(o.expected_date) })));
    } catch (err) {
      this.error.set(errorMessage(err, 'Error al cargar agenda'));
    } finally {
      this.loading.set(false);
    }
  }

  async receive(orderId: string): Promise<void> {
    this.receivingId.set(orderId);
    this.actionError.set(null);
    try {
      await this.purchases.receivePurchaseOrder(orderId);
      await this.refresh();
    } catch (err) {
      this.actionError.set(errorMessage(err, 'Error al recibir pedido'));
    } finally {
      this.receivingId.set(null);
    }
  }

  itemsSummary(order: ScheduledOrder): string {
    return order.items.slice(0, 3).map(i => i.product?.name ?? '—').join(', ');
  }

  async cancel(orderId: string): Promise<void> {
    this.cancellingId.set(orderId);
    this.actionError.set(null);
    try {
      await this.purchases.cancelPurchaseOrder(orderId);
      await this.refresh();
    } catch (err) {
      this.actionError.set(errorMessage(err, 'Error al cancelar pedido'));
    } finally {
      this.cancellingId.set(null);
    }
  }
}
