import { ChangeDetectionStrategy, Component, computed, inject, signal } from '@angular/core';
import { CurrencyPipe, DatePipe, DecimalPipe } from '@angular/common';
import { RouterLink } from '@angular/router';
import { AuthService } from '../../../../services/auth/auth.service';
import { ReportQueryService } from '../../../../services/report/query.service';
import { OrderQueryService } from '../../../../services/order/query.service';
import { SubscriptionStateService } from '../../../../services/subscription/subscription-state.service';
import { ExportService, SalesReportRow, SalesSummary } from '../../../../services/export/export.service';
import { DailyIncome } from '../../../../models/daily-income.model';
import { MonthlyIncome } from '../../../../models/monthly-income.model';
import { OrderWithDetails, PaymentMethod, PAYMENT_METHOD_LABEL, orderPrimaryLabel } from '../../../../models/order.model';
import { SkeletonBarsComponent } from '../../../shared/skeleton-bars.component';
import { SkeletonRowsComponent } from '../../../shared/skeleton-rows.component';

@Component({
  selector: 'app-admin-home',
  imports: [SkeletonRowsComponent, SkeletonBarsComponent, CurrencyPipe, DatePipe, DecimalPipe, RouterLink],
  templateUrl: './home.component.html',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class AdminHomeComponent {
  private readonly reportQuery  = inject(ReportQueryService);
  private readonly orderQuery   = inject(OrderQueryService);
  private readonly exportService = inject(ExportService);
  private readonly subscriptionState = inject(SubscriptionStateService);
  protected readonly auth       = inject(AuthService);

  // Ingresos del mes, ingresos por categoría y exportación son del plan
  // Negocio, igual que en /admin/reports.
  readonly hasAdvancedReports = computed(() => this.subscriptionState.allows('advanced_reports'));

  readonly loading         = signal(true);
  readonly daily           = signal<DailyIncome[]>([]);
  readonly monthly         = signal<MonthlyIncome[]>([]);
  readonly orders          = signal<OrderWithDetails[]>([]);
  readonly categoryRevenue = signal<{ category: string; total: number }[]>([]);
  readonly now             = signal(new Date());

  readonly orderPrimaryLabel    = orderPrimaryLabel;
  readonly PAYMENT_METHOD_LABEL = PAYMENT_METHOD_LABEL;

  // ── helpers ────────────────────────────────────────────────────────────
  private readonly monthStart = computed(() => {
    const n = new Date();
    return new Date(n.getFullYear(), n.getMonth(), 1);
  });

  // ── KPI: ingresos del mes ──────────────────────────────────────────────
  readonly currentMonthIncome = computed(() => {
    const ym = new Date().toISOString().slice(0, 7);
    return this.monthly().filter(m => m.month.startsWith(ym)).reduce((s, m) => s + Number(m.total), 0);
  });

  readonly monthOverMonth = computed<number | null>(() => {
    const now  = new Date();
    const cur  = now.toISOString().slice(0, 7);
    const prev = new Date(now);
    prev.setMonth(prev.getMonth() - 1);
    const prevYM = prev.toISOString().slice(0, 7);
    const sum  = (ym: string) =>
      this.monthly().filter(m => m.month.startsWith(ym)).reduce((s, m) => s + Number(m.total), 0);
    const a = sum(cur), b = sum(prevYM);
    if (b === 0) return null;
    return ((a - b) / b) * 100;
  });

  // ── KPI: ventas de la semana ───────────────────────────────────────────
  private readonly thisWeekOrders = computed(() => {
    const cutoff = new Date();
    cutoff.setDate(cutoff.getDate() - 7);
    return this.orders().filter(o => !o.cancelled_at && new Date(o.created_at) >= cutoff);
  });

  private readonly prevWeekOrders = computed(() => {
    const now  = new Date();
    const from = new Date(now); from.setDate(from.getDate() - 14);
    const to   = new Date(now); to.setDate(to.getDate() - 7);
    return this.orders().filter(o => {
      if (o.cancelled_at) return false;
      const d = new Date(o.created_at);
      return d >= from && d < to;
    });
  });

  readonly weekSalesCount = computed(() => this.thisWeekOrders().length);

  readonly weekOverWeek = computed<number | null>(() => {
    const prev = this.prevWeekOrders().length;
    if (prev === 0) return null;
    return ((this.weekSalesCount() - prev) / prev) * 100;
  });

  readonly weekSparkline = computed<number[]>(() => {
    const agg = this.daily().slice(-7);
    const max = agg.reduce((m, d) => Math.max(m, Number(d.total)), 0);
    if (max === 0) return [4, 6, 5, 8, 10, 7, 9];
    return agg.map(d => Math.max(4, Math.round((Number(d.total) / max) * 22)));
  });

  // ── Métodos de pago (donut) ────────────────────────────────────────────
  readonly totalMonthSales = computed(() =>
    this.orders().filter(o => !o.cancelled_at && new Date(o.created_at) >= this.monthStart()).length,
  );

  readonly paymentMethodStats = computed(() => {
    const ms     = this.monthStart();
    const counts = new Map<string, number>();
    let total    = 0;
    for (const o of this.orders()) {
      if (o.cancelled_at || new Date(o.created_at) < ms) continue;
      counts.set(o.payment_method, (counts.get(o.payment_method) ?? 0) + 1);
      total++;
    }
    return (['cash', 'card', 'qr'] as const)
      .map(m => ({
        key:   m,
        label: PAYMENT_METHOD_LABEL[m],
        count: counts.get(m) ?? 0,
        pct:   total === 0 ? 0 : Math.round(((counts.get(m) ?? 0) / total) * 100),
      }))
      .sort((a, b) => b.count - a.count);
  });

  // SVG stroke-dasharray donut. Circumference = 2π×40 ≈ 251.3
  readonly donutSegments = computed(() => {
    const C        = 2 * Math.PI * 40;
    const opacities = [1, 0.55, 0.25];
    let cum        = 0;
    return this.paymentMethodStats().map((s, i) => {
      const len = (s.pct / 100) * C;
      const seg = { ...s, dashArray: `${len.toFixed(2)} ${C.toFixed(2)}`, dashOffset: (-cum).toFixed(2), opacity: opacities[i] ?? 0.2 };
      cum += len;
      return seg;
    });
  });

  // ── Top 5 productos ────────────────────────────────────────────────────
  readonly topProducts = computed(() => {
    const ms  = this.monthStart();
    const map = new Map<string, { name: string; qty: number; total: number }>();
    for (const o of this.orders()) {
      if (o.cancelled_at || new Date(o.created_at) < ms) continue;
      for (const item of o.items) {
        const name = item.product_name ?? '—';
        const cur  = map.get(name) ?? { name, qty: 0, total: 0 };
        map.set(name, { name, qty: cur.qty + item.quantity, total: cur.total + item.unit_price * item.quantity });
      }
    }
    return Array.from(map.values()).sort((a, b) => b.qty - a.qty).slice(0, 5);
  });

  // ── Ingresos por categoría ─────────────────────────────────────────────
  readonly categoryRevenueWithPct = computed(() => {
    const cats  = this.categoryRevenue();
    const total = cats.reduce((s, c) => s + c.total, 0);
    const max   = cats[0]?.total ?? 1;
    return cats.slice(0, 5).map(c => ({
      ...c,
      pct:    total === 0 ? 0 : Math.round((c.total / total) * 100),
      barPct: Math.round((c.total / max) * 100),
    }));
  });

  // ── Ventas recientes ───────────────────────────────────────────────────
  readonly recentSales = computed(() => this.orders().slice(0, 8));

  // ── Export ─────────────────────────────────────────────────────────────
  private readonly exportRows = computed<SalesReportRow[]>(() => {
    const ms = this.monthStart();
    return this.orders()
      .filter(o => !o.cancelled_at && new Date(o.created_at) >= ms)
      .map(o => ({
        id: o.id,
        created_at: o.created_at,
        user_name: null,
        products_summary: o.items.map(i => `${i.product_name ?? '—'} ×${i.quantity}`).join(', '),
        payment_method: o.payment_method,
        total_amount: o.total_amount,
        item_count: o.items.length,
      }));
  });

  private readonly exportSummary = computed<SalesSummary>(() => {
    const rows = this.exportRows();
    const total = rows.reduce((s, r) => s + r.total_amount, 0);
    const byMethod: Record<PaymentMethod, number> = { cash: 0, card: 0, qr: 0 };
    rows.forEach(r => { byMethod[r.payment_method] += r.total_amount; });
    return { total, transactions: rows.length, avgTicket: rows.length ? total / rows.length : 0, byMethod };
  });

  private get dateRangeLabel(): string {
    const now = new Date();
    return `${now.toLocaleString('es-BO', { month: 'long', year: 'numeric' })}`;
  }

  exportExcel(): void {
    this.exportService.exportSalesToExcel(this.exportRows(), this.exportSummary(), this.dateRangeLabel);
  }

  exportPdf(): void {
    this.exportService.exportSalesToPdf(this.exportRows(), this.exportSummary(), this.dateRangeLabel);
  }

  constructor() {
    void this.refresh();
  }

  async refresh(): Promise<void> {
    this.loading.set(true);
    try {
      // El dashboard mostraba ingresos del mes y por categoría a cualquier
      // plan, justo lo que /admin/reports le bloquea al plan Caja: se estaba
      // regalando en el home lo que se cobra en Reportes. Además de ocultarlo,
      // ni se consulta — el corte no sirve de nada si el dato igual viaja.
      await this.subscriptionState.ensureLoaded();
      const advanced = this.hasAdvancedReports();

      await Promise.all([
        this.reportQuery.listDailyIncome(14).then(v => this.daily.set(v)),
        this.orderQuery.listOrders(100).then(v => this.orders.set(v)),
        ...(advanced
          ? [
              this.reportQuery.listMonthlyIncome(2).then(v => this.monthly.set(v)),
              this.reportQuery.listRevenueByCategoryThisMonth().then(v => this.categoryRevenue.set(v)),
            ]
          : []),
      ]);
    } catch (err) {
      console.error('Error cargando dashboard admin', err);
    } finally {
      this.loading.set(false);
    }
  }
}
