import { ChangeDetectionStrategy, Component, computed, inject, signal } from '@angular/core';
import { CurrencyPipe, DatePipe, DecimalPipe } from '@angular/common';
import { RouterLink } from '@angular/router';
import { AuthService } from '../../../../services/auth/auth.service';
import { ReportQueryService } from '../../../../services/report/query.service';
import { OrderQueryService } from '../../../../services/order/query.service';
import { DailyIncome } from '../../../../models/daily-income.model';
import { OrderWithDetails, orderPrimaryLabel, orderPrimaryType } from '../../../../models/order.model';

@Component({
  selector: 'app-caja-home',
  imports: [CurrencyPipe, DatePipe, DecimalPipe, RouterLink],
  templateUrl: './home.component.html',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class CajaHomeComponent {
  private readonly reportQuery = inject(ReportQueryService);
  private readonly orderQuery = inject(OrderQueryService);
  protected readonly auth = inject(AuthService);

  readonly loading = signal(true);
  readonly daily = signal<DailyIncome[]>([]);
  readonly recentOrders = signal<OrderWithDetails[]>([]);
  readonly now = signal(new Date());

  readonly isGym = computed(() => this.auth.businessType() === 'gym');

  readonly primaryLabel = orderPrimaryLabel;
  readonly primaryType = orderPrimaryType;

  private readonly today = new Date().toISOString().slice(0, 10);

  readonly todayProductTotal = computed(() =>
    this.daily()
      .filter((d) => d.day === this.today && d.type === 'product')
      .reduce((s, d) => s + Number(d.total), 0),
  );

  readonly todayMembershipTotal = computed(() =>
    this.daily()
      .filter((d) => d.day === this.today && d.type === 'membership')
      .reduce((s, d) => s + Number(d.total), 0),
  );

  readonly todayTotal = computed(() => this.todayProductTotal() + this.todayMembershipTotal());

  readonly todayTransactions = computed(() =>
    this.daily().filter((d) => d.day === this.today).reduce((s, d) => s + d.transactions, 0),
  );

  private readonly yesterday = (() => {
    const d = new Date();
    d.setDate(d.getDate() - 1);
    return d.toISOString().slice(0, 10);
  })();

  readonly yesterdayTotal = computed(() =>
    this.daily()
      .filter((d) => d.day === this.yesterday)
      .reduce((s, d) => s + Number(d.total), 0),
  );

  readonly dayOverDay = computed<number | null>(() => {
    const yest = this.yesterdayTotal();
    if (yest === 0) return null;
    return ((this.todayTotal() - yest) / yest) * 100;
  });

  readonly productPct = computed(() => {
    const total = this.todayTotal();
    if (total === 0) return 0;
    return (this.todayProductTotal() / total) * 100;
  });

  readonly latestOrders = computed(() => this.recentOrders().slice(0, 8));

  constructor() {
    void this.refresh();
  }

  async refresh(): Promise<void> {
    this.loading.set(true);
    try {
      const [daily, orders] = await Promise.all([
        this.reportQuery.listDailyIncome(7),
        this.orderQuery.listOrders(20),
      ]);
      this.daily.set(daily);
      this.recentOrders.set(orders);
    } catch (err) {
      console.error('Error cargando dashboard caja', err);
    } finally {
      this.loading.set(false);
    }
  }
}
