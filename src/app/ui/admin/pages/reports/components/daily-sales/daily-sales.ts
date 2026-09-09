import {
  ChangeDetectionStrategy,
  Component,
  computed,
  inject,
  OnInit,
  signal,
} from '@angular/core';
import { CurrencyPipe, DatePipe, DecimalPipe } from '@angular/common';
import {
  DailySalesSummary,
  EMPTY_DAILY_SUMMARY,
  TopProduct,
  TopProductOrderBy,
} from '../../../../../../models/daily-sales.model';
import { PAYMENT_METHOD_LABEL, PaymentMethod } from '../../../../../../models/order.model';
import { computeMargin, EMPTY_PROFIT_TOTALS, ProfitTotals } from '../../../../../../models/profit.model';
import {
  DAY_RANGE_LABELS,
  DailySalesQueryService,
  DayRange,
  OpenSessionSales,
} from '../../../../../../services/report/daily-sales.query.service';
import { errorMessage } from '../../../../../../utilities/error-message';
import { SkeletonBarsComponent } from '../../../../../shared/skeleton-bars.component';
import { ZeroCostNoticeComponent } from '../zero-cost-notice/zero-cost-notice';

const RANGES: DayRange[] = ['today', 'week', 'month'];
const METHODS: PaymentMethod[] = ['cash', 'card', 'qr'];

@Component({
  selector: 'app-admin-reports-daily-sales',
  imports: [SkeletonBarsComponent, ZeroCostNoticeComponent, CurrencyPipe, DatePipe, DecimalPipe],
  templateUrl: './daily-sales.html',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class DailySalesReportComponent implements OnInit {
  private readonly query = inject(DailySalesQueryService);

  readonly ranges = RANGES;
  readonly rangeLabels = DAY_RANGE_LABELS;
  readonly methods = METHODS;
  readonly methodLabels = PAYMENT_METHOD_LABEL;

  readonly range = signal<DayRange>('today');
  readonly summary = signal<DailySalesSummary>(EMPTY_DAILY_SUMMARY);
  readonly profit = signal<ProfitTotals>(EMPTY_PROFIT_TOTALS);
  readonly zeroCostCount = signal<number | null>(null);
  readonly topProducts = signal<TopProduct[]>([]);
  readonly topOrderBy = signal<TopProductOrderBy>('quantity');
  readonly openSessions = signal<OpenSessionSales[]>([]);
  readonly loading = signal(false);
  readonly error = signal<string | null>(null);

  readonly margin = computed(() => computeMargin(this.profit().profit, this.profit().revenue));

  // Proporción de cada método sobre el total, para las barras. Es lo que
  // permite contrastar el efectivo declarado con el arqueo del turno.
  readonly methodShares = computed(() => {
    const s = this.summary();
    return METHODS.map((method) => ({
      method,
      amount: s.byMethod[method],
      percentage: s.total === 0 ? 0 : (s.byMethod[method] / s.total) * 100,
    }));
  });

  readonly maxTopValue = computed(() => {
    const key = this.topOrderBy() === 'profit' ? 'profit' : 'quantity';
    return this.topProducts().reduce((max, p) => Math.max(max, Number(p[key])), 0);
  });

  async ngOnInit(): Promise<void> {
    await this.refresh();
  }

  async setRange(range: DayRange): Promise<void> {
    if (this.range() === range) return;
    this.range.set(range);
    await this.refresh();
  }

  async setTopOrderBy(orderBy: TopProductOrderBy): Promise<void> {
    if (this.topOrderBy() === orderBy) return;
    this.topOrderBy.set(orderBy);
    await this.refreshTopProducts();
  }

  async refresh(): Promise<void> {
    this.loading.set(true);
    this.error.set(null);
    try {
      const [summary, profit, zeroCost] = await Promise.all([
        this.query.summary(this.range()),
        this.query.profitSummary(this.range()),
        this.query.zeroCostProductCount(this.range()),
      ]);
      this.summary.set(summary);
      this.profit.set(profit);
      this.zeroCostCount.set(zeroCost);
      await this.refreshTopProducts();
      // Los turnos abiertos son del momento, no del rango: se piden aparte y
      // un fallo acá no debe tumbar el resto del reporte.
      await this.refreshOpenSessions();
    } catch (err: unknown) {
      this.error.set(errorMessage(err, 'No se pudo cargar el reporte de ventas'));
    } finally {
      this.loading.set(false);
    }
  }

  private async refreshTopProducts(): Promise<void> {
    const top = await this.query.topProducts(this.range(), 5, this.topOrderBy());
    this.topProducts.set(
      top.map((p) => ({
        ...p,
        quantity: Number(p.quantity),
        total: Number(p.total),
        cost: Number(p.cost),
        profit: Number(p.profit),
        margin: p.margin === null ? null : Number(p.margin),
      })),
    );
  }

  private async refreshOpenSessions(): Promise<void> {
    try {
      this.openSessions.set(await this.query.openSessions());
    } catch {
      // Un cajero que llegue acá no tiene permiso para ver turnos en curso.
      // No es un error del reporte: simplemente no se muestra la sección.
      this.openSessions.set([]);
    }
  }

  expectedCash(session: OpenSessionSales): number {
    return Number(session.opening_float) + Number(session.cash_sales);
  }
}
