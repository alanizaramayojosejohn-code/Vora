import { ChangeDetectionStrategy, Component, computed, inject, signal } from '@angular/core';
import { CurrencyPipe, DatePipe, DecimalPipe } from '@angular/common';
import { RouterLink } from '@angular/router';
import { AuthService } from '../../../../services/auth/auth.service';
import { ReportQueryService } from '../../../../services/report/query.service';
import { SaleQueryService } from '../../../../services/sale/query.service';
import { DailyIncome } from '../../../../models/daily-income.model';
import { SaleWithDetails } from '../../../../models/sale.model';

@Component({
  selector: 'app-caja-home',
  imports: [CurrencyPipe, DatePipe, DecimalPipe, RouterLink],
  templateUrl: './home.component.html',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class CajaHomeComponent {
  private readonly reportQuery = inject(ReportQueryService);
  private readonly saleQuery = inject(SaleQueryService);
  protected readonly auth = inject(AuthService);

  readonly loading = signal(true);
  readonly daily = signal<DailyIncome[]>([]);
  readonly recentSales = signal<SaleWithDetails[]>([]);
  readonly now = signal(new Date());

  readonly isGym = computed(() => this.auth.businessType() === 'gym');

  // Today's totals separados por tipo. La vista income_daily devuelve
  // una row por (dia, type), asi que filtramos por hoy y sumamos.
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

  // Yesterday total para comparacion. La vista trae 30 dias asi que
  // hay datos para 'ayer' siempre que haya habido movimiento.
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

  // Split visual del total de hoy: % productos vs membresías.
  readonly productPct = computed(() => {
    const total = this.todayTotal();
    if (total === 0) return 0;
    return (this.todayProductTotal() / total) * 100;
  });

  // Ultimas 8 ventas (no canceladas en la cabeza, lo que sea reciente).
  readonly latestSales = computed(() => this.recentSales().slice(0, 8));

  constructor() {
    void this.refresh();
  }

  async refresh(): Promise<void> {
    this.loading.set(true);
    try {
      const [daily, sales] = await Promise.all([
        this.reportQuery.listDailyIncome(7),
        this.saleQuery.listSales(20),
      ]);
      this.daily.set(daily);
      this.recentSales.set(sales);
    } catch (err) {
      console.error('Error cargando dashboard caja', err);
    } finally {
      this.loading.set(false);
    }
  }
}
