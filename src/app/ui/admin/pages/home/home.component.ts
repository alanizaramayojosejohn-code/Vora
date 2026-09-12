import { ChangeDetectionStrategy, Component, computed, inject, LOCALE_ID, signal } from '@angular/core';
import { CurrencyPipe, DatePipe, DecimalPipe, formatDate } from '@angular/common';
import { RouterLink } from '@angular/router';
import { AuthService } from '../../../../services/auth/auth.service';
import { CategoryRevenue, ReportQueryService } from '../../../../services/report/query.service';
import { OrderQueryService } from '../../../../services/order/query.service';
import { SubscriptionStateService } from '../../../../services/subscription/subscription-state.service';
import { ExportService, SalesReportRow, SalesSummary } from '../../../../services/export/export.service';
import { ProductQueryService } from '../../../../services/product/query.service';
import { Product } from '../../../../models/product.model';
import { MonthlyIncome } from '../../../../models/monthly-income.model';
import { computeMargin } from '../../../../models/profit.model';
import { LowStockProduct } from '../../../../models/low-stock-product.model';
import {
  DailySalesSummary,
  EMPTY_DAILY_SUMMARY,
} from '../../../../models/daily-sales.model';
import {
  DailySalesQueryService,
  DayRange,
  DAY_RANGE_LABELS,
  OpenSessionSales,
} from '../../../../services/report/daily-sales.query.service';
import {
  orderCost,
  OrderWithDetails,
  orderProfit,
  PaymentMethod,
  PAYMENT_METHOD_LABEL,
  orderDestinationLabel,
  orderPaymentLabel,
  orderPaymentMethods,
  orderPrimaryLabel,
} from '../../../../models/order.model';
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
  private readonly dailySales   = inject(DailySalesQueryService);
  private readonly productQuery = inject(ProductQueryService);
  private readonly exportService = inject(ExportService);
  private readonly subscriptionState = inject(SubscriptionStateService);
  private readonly locale       = inject(LOCALE_ID);
  protected readonly auth       = inject(AuthService);

  // Ingresos del mes, ingresos por categoría y exportación son del plan
  // Negocio, igual que en /admin/reports.
  readonly hasAdvancedReports = computed(() => this.subscriptionState.allows('advanced_reports'));

  readonly loading         = signal(true);
  readonly monthly         = signal<MonthlyIncome[]>([]);
  readonly orders          = signal<OrderWithDetails[]>([]);
  readonly categoryRevenue = signal<CategoryRevenue[]>([]);
  readonly products        = signal<Product[]>([]);
  readonly now             = signal(new Date());

  // Periodo del segmented de arriba. Arranca en 'month' para no cambiar el
  // comportamiento que ya tenía la página (el gráfico ya mostraba 30 días).
  readonly period = signal<DayRange>('month');

  // Datos que los DOS planes pueden ver. Sin esto el panel del plan Caja
  // quedaba con la mitad de la grilla vacía: al ocultar lo que es de
  // Negocio no entraba nada en su lugar.
  readonly todaySummary = signal<DailySalesSummary>(EMPTY_DAILY_SUMMARY);
  readonly openSessions = signal<OpenSessionSales[]>([]);
  readonly lowStock     = signal<LowStockProduct[]>([]);

  readonly openShiftCount = computed(() => this.openSessions().length);

  // Efectivo que debería haber sumando todos los cajones abiertos.
  readonly expectedCashNow = computed(() =>
    this.openSessions().reduce(
      (sum, s) => sum + Number(s.opening_float) + Number(s.cash_sales),
      0,
    ),
  );

  // Tiempo transcurrido desde que se abrió el turno más antiguo en curso,
  // para el rediseño del KPI "Turno de caja" ("2 cajas · 4h 12m"). Sale de
  // opened_at, que openSessions() ya trae — no es una llamada nueva.
  readonly shiftDurationLabel = computed<string | null>(() => {
    const sessions = this.openSessions();
    if (sessions.length === 0) return null;
    const earliest = Math.min(...sessions.map(s => new Date(s.opened_at).getTime()));
    const minutes = Math.max(0, Math.floor((this.now().getTime() - earliest) / 60_000));
    const h = Math.floor(minutes / 60);
    const m = minutes % 60;
    return h > 0 ? `${h}h ${m}m` : `${m}m`;
  });

  readonly orderPrimaryLabel      = orderPrimaryLabel;
  readonly orderDestinationLabel  = orderDestinationLabel;
  readonly PAYMENT_METHOD_LABEL   = PAYMENT_METHOD_LABEL;
  readonly paymentLabel = orderPaymentLabel;

  // Clases de Tailwind para la paleta categórica ($cat-1..$cat-6 en
  // styles.css). Tienen que quedar escritas literal en el .ts —y no
  // armadas con `'bg-cat-' + i`— porque Tailwind genera el CSS a partir
  // del texto que encuentra en el código fuente: una clase compuesta en
  // runtime nunca aparece ahí y no se genera nada.
  readonly categoryColorClasses: readonly string[] = [
    'bg-cat-1', 'bg-cat-2', 'bg-cat-3', 'bg-cat-4', 'bg-cat-5', 'bg-cat-6',
  ];

  // ── helpers ────────────────────────────────────────────────────────────
  // Mes calendario. Sigue vivo porque el export (Excel/PDF) reporta "el mes
  // en curso" y eso no depende del segmented de periodo.
  private readonly monthStart = computed(() => {
    const n = new Date();
    return new Date(n.getFullYear(), n.getMonth(), 1);
  });

  // Inicio de la ventana del segmented de periodo, en hora LOCAL (mismo
  // motivo que DailySalesQueryService.localDate: toISOString() adelanta un
  // día en Bolivia). Las ventanas son inclusivas de 1/7/30 días, igual que
  // DailySalesQueryService.rangeBounds — 'month' es una ventana móvil de 30
  // días, no el mes calendario.
  readonly periodStart = computed<Date>(() => {
    const offsetDays = this.period() === 'today' ? 0 : this.period() === 'week' ? 6 : 29;
    const d = new Date();
    d.setHours(0, 0, 0, 0);
    d.setDate(d.getDate() - offsetDays);
    return d;
  });

  readonly periodLabel = computed(() => DAY_RANGE_LABELS[this.period()]);

  // ── KPI: ingresos del mes ──────────────────────────────────────────────
  readonly currentMonthIncome = computed(() => {
    const ym = new Date().toISOString().slice(0, 7);
    return this.monthly().filter(m => m.month.startsWith(ym)).reduce((s, m) => s + Number(m.total), 0);
  });

  // Ganancia bruta del mes en curso (spec 002, RF-21), junto al ingreso.
  readonly currentMonthProfit = computed(() => {
    const ym = new Date().toISOString().slice(0, 7);
    return this.monthly().filter(m => m.month.startsWith(ym)).reduce((s, m) => s + Number(m.profit), 0);
  });

  readonly currentMonthMargin = computed(() =>
    computeMargin(this.currentMonthProfit(), this.currentMonthIncome()),
  );

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

  // El mismo delta, pero solo cuando el selector está en la ventana larga. Va
  // pegado al total del gráfico, que sí sigue al periodo: al lado de una cifra
  // de "Hoy", un "+12% vs mes pasado" se lee como el delta de ESE número y
  // miente. El KPI "Ingresos del mes" sigue mostrando monthOverMonth() sin
  // condición, porque ahí la comparación y la cifra hablan del mismo mes.
  readonly chartMonthDelta = computed<number | null>(() =>
    this.period() === 'month' ? this.monthOverMonth() : null,
  );

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

  // Ventas por día de los últimos 7, contadas sobre las órdenes que ya están
  // cargadas. Antes salía de income_daily, que es un reporte de ingresos y no
  // está incluido en el plan Caja; además el KPI de al lado cuenta ventas, así
  // que un sparkline de importes medía otra cosa que el número que acompaña.
  readonly weekSparkline = computed<number[]>(() => {
    const counts = new Array<number>(7).fill(0);
    const today = new Date();
    today.setHours(0, 0, 0, 0);

    for (const o of this.orders()) {
      if (o.cancelled_at) continue;
      const d = new Date(o.created_at);
      d.setHours(0, 0, 0, 0);
      const daysAgo = Math.round((today.getTime() - d.getTime()) / 86_400_000);
      if (daysAgo >= 0 && daysAgo < 7) counts[6 - daysAgo]++;
    }

    const max = Math.max(...counts);
    if (max === 0) return counts.map(() => 4);
    return counts.map(c => Math.max(4, Math.round((c / max) * 22)));
  });

  // ── Gráfico de ingresos y ganancia ──────────────────────────────────────
  // Sigue al selector de periodo: 24 buckets por hora en 'today' (created_at
  // es un timestamp, el dato existe), 7 u 30 buckets por día en 'week'/
  // 'month'. Sale de las mismas órdenes que ya carga el dashboard (orders(),
  // hasta 100) — sin pedir nada nuevo al backend, igual que weekSparkline de
  // arriba. orderProfit()/orderCost() son las mismas funciones que usa el
  // resto del panel (spec 002).
  private buildChartBuckets(buckets: { date: Date; revenue: number; profit: number }[]) {
    const max = Math.max(1, ...buckets.map(b => b.revenue));
    return buckets.map(b => {
      const heightPct = b.revenue > 0 ? Math.max(4, Math.round((b.revenue / max) * 100)) : 0;
      const profitShare = b.revenue > 0
        ? Math.max(0, Math.min(100, Math.round((b.profit / b.revenue) * 100)))
        : 0;
      return { ...b, heightPct, profitShare, costShare: 100 - profitShare };
    });
  }

  readonly dailyRevenueSeries = computed(() => {
    const today = new Date();
    today.setHours(0, 0, 0, 0);

    if (this.period() === 'today') {
      const buckets: { date: Date; revenue: number; profit: number }[] = [];
      for (let h = 0; h < 24; h++) {
        const d = new Date(today);
        d.setHours(h, 0, 0, 0);
        buckets.push({ date: d, revenue: 0, profit: 0 });
      }
      const tomorrow = new Date(today);
      tomorrow.setDate(tomorrow.getDate() + 1);

      for (const o of this.orders()) {
        if (o.cancelled_at) continue;
        const d = new Date(o.created_at);
        if (d < today || d >= tomorrow) continue; // fuera de hoy
        buckets[d.getHours()].revenue += Number(o.total_amount);
        buckets[d.getHours()].profit += orderProfit(o);
      }
      return this.buildChartBuckets(buckets);
    }

    const days = this.period() === 'week' ? 7 : 30;
    const buckets: { date: Date; revenue: number; profit: number }[] = [];
    for (let i = days - 1; i >= 0; i--) {
      const d = new Date(today);
      d.setDate(d.getDate() - i);
      buckets.push({ date: d, revenue: 0, profit: 0 });
    }
    const indexByTime = new Map(buckets.map((b, idx) => [b.date.getTime(), idx]));

    for (const o of this.orders()) {
      if (o.cancelled_at) continue;
      const d = new Date(o.created_at);
      d.setHours(0, 0, 0, 0);
      const idx = indexByTime.get(d.getTime());
      if (idx === undefined) continue; // fuera de la ventana del periodo
      buckets[idx].revenue += Number(o.total_amount);
      buckets[idx].profit += orderProfit(o);
    }

    return this.buildChartBuckets(buckets);
  });

  readonly chartTotalRevenue = computed(() =>
    this.dailyRevenueSeries().reduce((s, d) => s + d.revenue, 0),
  );

  readonly chartPeakDay = computed(() => {
    const series = this.dailyRevenueSeries();
    if (series.length === 0) return null;
    return series.reduce((max, d) => (d.revenue > max.revenue ? d : max), series[0]);
  });

  // El bucket pico no siempre es un día: en 'today' es una hora. Formatearlo
  // acá y no con un `| date:'d MMM'` fijo en el template evita que el pico de
  // las 14:00 se anuncie como la fecha de hoy en las 24 barras.
  readonly chartPeakLabel = computed<string | null>(() => {
    const peak = this.chartPeakDay();
    if (!peak) return null;
    const fmt = this.period() === 'today' ? 'HH:mm' : 'd MMM';
    return formatDate(peak.date, fmt, this.locale);
  });

  // 5 marcas del eje Y, redondeadas al millar más cercano hacia arriba.
  readonly chartYAxisTicks = computed<string[]>(() => {
    const max = Math.max(1, ...this.dailyRevenueSeries().map(d => d.revenue));
    const rounded = Math.max(1000, Math.ceil(max / 1000) * 1000);
    const steps = 4;
    const ticks: string[] = [];
    for (let i = 0; i <= steps; i++) {
      const v = rounded - (rounded / steps) * i;
      ticks.push(v >= 1000 ? `${Math.round(v / 1000)}k` : `${Math.round(v)}`);
    }
    return ticks;
  });

  // 3 marcas del eje X (primer bucket, medio, último) en vez de las 7 del
  // diseño: en un teléfono no entran más sin superponerse. Ya formateadas acá
  // (en vez de dejarle el Date al DatePipe del template) porque el formato
  // depende del periodo: horario en 'today' (08:00), diario en el resto (12
  // sep) — dos pipes distintos según el modo no se pueden expresar en el
  // template con un solo `| date`.
  readonly chartXAxisLabels = computed<string[]>(() => {
    const series = this.dailyRevenueSeries();
    if (series.length === 0) return [];
    const mid = Math.floor((series.length - 1) / 2);
    const fmt = this.period() === 'today' ? 'HH:mm' : 'd MMM';
    return [series[0].date, series[mid].date, series[series.length - 1].date]
      .map(d => formatDate(d, fmt, this.locale));
  });

  // ── Métodos de pago (donut) ────────────────────────────────────────────
  readonly totalPeriodSales = computed(() =>
    this.orders().filter(o => !o.cancelled_at && new Date(o.created_at) >= this.periodStart()).length,
  );

  readonly paymentMethodStats = computed(() => {
    const ps     = this.periodStart();
    const counts = new Map<string, number>();
    let total    = 0;
    for (const o of this.orders()) {
      if (o.cancelled_at || new Date(o.created_at) < ps) continue;
      // Una venta dividida cuenta una vez por cada método con el que se cobró;
      // una cuenta pendiente no cuenta en ninguno, porque todavía no se cobró.
      for (const method of orderPaymentMethods(o)) {
        counts.set(method, (counts.get(method) ?? 0) + 1);
        total++;
      }
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
  // Agrupa por product_id (cayendo al nombre cuando es null, p. ej. ítems de
  // ventas viejas o productos borrados) para poder resolver foto y categoría
  // contra products(), que ya carga refresh(). El nombre mostrado sigue
  // saliendo de la orden (product_name), no de products(): es el nombre que
  // tenía el producto AL MOMENTO de la venta, no el actual.
  readonly topProducts = computed(() => {
    const start = this.periodStart();
    const productsById = new Map(this.products().map(p => [p.id, p]));
    const map = new Map<string, {
      key: string; name: string; qty: number; total: number;
      imageUrl: string | null; category: string | null;
    }>();
    for (const o of this.orders()) {
      if (o.cancelled_at || new Date(o.created_at) < start) continue;
      for (const item of o.items) {
        const key = item.product_id ?? item.product_name ?? '—';
        const product = item.product_id ? productsById.get(item.product_id) : undefined;
        const cur = map.get(key) ?? {
          key,
          name: item.product_name ?? '—',
          qty: 0,
          total: 0,
          imageUrl: product?.image_url ?? null,
          category: product?.category?.name ?? null,
        };
        map.set(key, { ...cur, qty: cur.qty + item.quantity, total: cur.total + item.unit_price * item.quantity });
      }
    }
    return Array.from(map.values()).sort((a, b) => b.qty - a.qty).slice(0, 5);
  });

  // Iniciales del placeholder de producto sin foto — mismo criterio que
  // initials() en products/list.ts (no se puede importar de un componente a
  // otro sin acoplarlos, así que se replica la regla, no el código).
  initials(name: string): string {
    const parts = name.trim().split(/\s+/).filter(Boolean);
    if (parts.length === 0) return '··';
    if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
    return (parts[0][0] + parts[1][0]).toUpperCase();
  }

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
        payments: o.payments.map(p => ({ method: p.method, amount: p.amount })),
        payment_methods: orderPaymentMethods(o),
        total_amount: o.total_amount,
        cost: orderCost(o),
        profit: orderProfit(o),
        item_count: o.items.length,
        status: o.status,
      }));
  });

  private readonly exportSummary = computed<SalesSummary>(() => {
    const rows = this.exportRows();
    const total = rows.reduce((s, r) => s + r.total_amount, 0);
    const cost = rows.reduce((s, r) => s + r.cost, 0);
    const byMethod: Record<PaymentMethod, number> = { cash: 0, card: 0, qr: 0 };
    rows.forEach(r => r.payments.forEach(p => { byMethod[p.method] += p.amount; }));
    return {
      total, cost, profit: total - cost,
      transactions: rows.length, avgTicket: rows.length ? total / rows.length : 0, byMethod,
    };
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

      // Piso de 29 días atrás: la ventana más ancha que ofrece el segmented
      // de periodo ("30 días"). Antes se pedían "los últimos 100 pedidos" sin
      // mirar la fecha, así que en un negocio con más de 100 ventas en el mes
      // el filtro de 30 días quedaba truncado a lo que entrara en esos 100 —
      // mostraba menos días de los que decía mostrar. Acotar por FECHA en vez
      // de por CANTIDAD hace que Hoy/7 días/30 días sean exactos sin importar
      // el volumen del negocio.
      const periodFloor = new Date();
      periodFloor.setHours(0, 0, 0, 0);
      periodFloor.setDate(periodFloor.getDate() - 29);

      await Promise.all([
        // Solo las cobradas: todos los KPI de abajo (ventas de la semana, top
        // de productos, métodos de pago, export) cuentan ventas realizadas, y
        // una cuenta que sigue abierta todavía no lo es (RF-20). Filtrado en
        // el servidor -no se piden pendientes para descartarlos después.
        this.orderQuery
          .listOrdersSince(periodFloor.toISOString(), { status: 'settled' })
          .then(v => this.orders.set(v)),
        this.dailySales.summary('today').then(v => this.todaySummary.set(v)),
        // Los turnos en curso los sirve una RPC que exige rol admin. Un fallo
        // acá no debe tumbar el resto del panel.
        this.dailySales.openSessions().then(v => this.openSessions.set(v)).catch(() => {}),
        // Foto y categoría para las miniaturas de "Productos TOP". Es la
        // única llamada nueva al backend de todo este cambio.
        this.productQuery.listProducts().then(v => this.products.set(v)),
        // El bajo stock solo se pinta en el plan Caja, así que solo ahí se pide.
        ...(advanced
          ? [
              this.reportQuery.listMonthlyIncome(2).then(v => this.monthly.set(v)),
              this.reportQuery.listRevenueByCategoryThisMonth().then(v => this.categoryRevenue.set(v)),
            ]
          : [this.reportQuery.listLowStockProducts().then(v => this.lowStock.set(v))]),
      ]);
    } catch (err) {
      console.error('Error cargando dashboard admin', err);
    } finally {
      this.loading.set(false);
    }
  }
}
