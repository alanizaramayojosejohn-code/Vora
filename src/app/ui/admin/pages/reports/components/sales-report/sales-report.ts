import {
  ChangeDetectionStrategy,
  Component,
  computed,
  inject,
  OnInit,
  signal,
} from '@angular/core';
import { CurrencyPipe, DatePipe, DecimalPipe } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { PAYMENT_METHOD_LABEL, PAYMENT_METHOD_STYLE, PaymentMethod } from '../../../../../../models/order.model';
import { computeMargin } from '../../../../../../models/profit.model';
import { ExportService, SalesReportRow, SalesSummary } from '../../../../../../services/export/export.service';
import {
  ProductOption,
  SalesReportFilters,
  SalesReportQueryService,
} from '../../../../../../services/report/sales-report.query.service';
import { Profile } from '../../../../../../models/profile.model';
import { errorMessage } from '../../../../../../utilities/error-message';

const ALL_METHODS: PaymentMethod[] = ['cash', 'card', 'qr'];

// Colores del chip de método en la tabla y la barra de filtros: el rediseño
// los tipa por color (RF del rediseño de reporte de ventas) en vez del mismo
// tono para los tres. Vive acá y no en PAYMENT_METHOD_STYLE (order.model.ts)
// porque ese record es compartido con otras pantallas (caja, historial de
// pagos) que no piden este cambio de paleta — tocarlo ahí las afectaría.
const METHOD_CHIP_CLASSES: Record<PaymentMethod, string> = {
  cash: 'bg-success-wash text-success border-success-line',
  qr: 'bg-primary-wash text-primary border-primary-line',
  card: 'bg-cat-4-wash text-cat-4 border-cat-4-line',
};

// Mismo criterio de color, pero como fondo sólido para el punto de la
// leyenda "Cobrado por método" (ahí no hay chip con borde, solo un dot).
const METHOD_DOT_CLASSES: Record<PaymentMethod, string> = {
  cash: 'bg-success',
  qr: 'bg-primary',
  card: 'bg-cat-4',
};

@Component({
  selector: 'app-admin-sales-report',
  imports: [CurrencyPipe, DatePipe, DecimalPipe, FormsModule],
  templateUrl: './sales-report.html',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class SalesReportComponent implements OnInit {
  private readonly query = inject(SalesReportQueryService);
  private readonly exportSvc = inject(ExportService);

  // ---- Opciones de filtros ----
  readonly users = signal<Pick<Profile, 'id' | 'name' | 'role'>[]>([]);
  readonly products = signal<ProductOption[]>([]);

  // ---- Estado de filtros ----
  readonly dateFrom = signal(this.defaultDateFrom());
  readonly dateTo = signal(this.today());
  readonly selectedUserId = signal('');
  readonly selectedProductId = signal('');
  readonly selectedMethods = signal<Set<PaymentMethod>>(new Set(ALL_METHODS));

  // ---- Resultado ----
  readonly rows = signal<SalesReportRow[]>([]);
  readonly summary = signal<SalesSummary>({
    total: 0, cost: 0, profit: 0, transactions: 0, avgTicket: 0,
    byMethod: { cash: 0, card: 0, qr: 0 },
  });
  readonly zeroCostCount = signal<number | null>(null);
  readonly loading = signal(false);
  readonly error = signal<string | null>(null);
  readonly hasQueried = signal(false);

  readonly margin = computed(() => computeMargin(this.summary().profit, this.summary().total));

  // El conteo del resumen de arriba solo incluye lo cobrado (summary().
  // transactions); esto es aparte, para que la barra de la tabla diga cuántas
  // de las filas visibles son cuentas todavía abiertas.
  readonly pendingCount = computed(() => this.rows().filter((r) => r.status === 'pending').length);

  // ---- Paginación ----
  readonly page = signal(0);
  readonly pageSize = 50;
  readonly paginated = computed(() => {
    const start = this.page() * this.pageSize;
    return this.rows().slice(start, start + this.pageSize);
  });
  readonly totalPages = computed(() => Math.max(1, Math.ceil(this.rows().length / this.pageSize)));

  readonly dateRangeLabel = computed(() => {
    const from = this.dateFrom();
    const to = this.dateTo();
    if (!from && !to) return 'Todas las fechas';
    if (from && to) return `${from} al ${to}`;
    if (from) return `Desde ${from}`;
    return `Hasta ${to}`;
  });

  readonly methodLabels = PAYMENT_METHOD_LABEL;
  readonly methodStyle = PAYMENT_METHOD_STYLE;
  readonly methodChipClasses = METHOD_CHIP_CLASSES;
  readonly methodDotClasses = METHOD_DOT_CLASSES;
  readonly allMethods = ALL_METHODS;

  // ---- Derivados para el rediseño de la tarjeta "Resultado del periodo" ----
  // Ancho de cada tramo de la barra partida costo/ganancia, como % del
  // ingreso total. Se acota a [0, 100]: si la ganancia es negativa (se vendió
  // por debajo del costo) el tramo verde se lee como 0 en vez de invertir la
  // barra, que sería ilegible.
  readonly costShare = computed(() => {
    const { total, cost } = this.summary();
    if (total <= 0) return 0;
    return Math.max(0, Math.min(100, (cost / total) * 100));
  });
  readonly profitShare = computed(() => {
    const { total, profit } = this.summary();
    if (total <= 0) return 0;
    return Math.max(0, Math.min(100, (profit / total) * 100));
  });

  // ---- Derivado para la tarjeta "Cobrado por método" ----
  // El diseño muestra cada método ordenado de mayor a menor monto, con su
  // porcentaje sobre el ingreso total. summary().byMethod ya trae los montos
  // (spec 002); acá solo se ordena y se calcula el %, sin pedir nada nuevo.
  readonly methodBreakdown = computed(() => {
    const { total, byMethod } = this.summary();
    return ALL_METHODS.map((method) => {
      const amount = byMethod[method];
      return {
        method,
        label: this.methodLabels[method],
        amount,
        pct: total > 0 ? (amount / total) * 100 : 0,
      };
    }).sort((a, b) => b.amount - a.amount);
  });

  // ---- Derivado para la tarjeta "Volumen" ----
  // Ítems vendidos en las ventas cobradas, con el mismo filtro que
  // buildSummary() (status === 'settled'): una cuenta pendiente todavía no
  // vendió nada en firme, así que sus ítems no cuentan acá tampoco.
  readonly totalItems = computed(() =>
    this.rows()
      .filter((r) => r.status === 'settled')
      .reduce((sum, r) => sum + r.item_count, 0),
  );

  // ---- Paginación numerada ----
  // Lista de páginas a mostrar, con '…' cuando hay más de las que entran.
  // Siempre primera, última, y una ventana de 3 alrededor de la actual.
  readonly pageNumbers = computed(() => {
    const total = this.totalPages();
    const current = this.page() + 1; // 1-indexado para mostrar
    if (total <= 7) {
      return Array.from({ length: total }, (_, i) => i + 1);
    }
    const items: (number | 'ellipsis')[] = [1];
    if (current > 3) items.push('ellipsis');
    const start = Math.max(2, current - 1);
    const end = Math.min(total - 1, current + 1);
    for (let i = start; i <= end; i++) items.push(i);
    if (current < total - 2) items.push('ellipsis');
    items.push(total);
    return items;
  });

  readonly pageRangeLabel = computed(() => {
    const total = this.rows().length;
    if (total === 0) return 'Sin resultados';
    const start = this.page() * this.pageSize + 1;
    const end = Math.min((this.page() + 1) * this.pageSize, total);
    return `Mostrando ${start}–${end} de ${total} resultados`;
  });

  ngOnInit(): void {
    void this.loadInitial();
  }

  private async loadInitial(): Promise<void> {
    const [users, products] = await Promise.all([
      this.query.listUsersForFilter(),
      this.query.listProductsForFilter(),
    ]);
    this.users.set(users);
    this.products.set(products);
    await this.applyFilters();
  }

  toggleMethod(m: PaymentMethod): void {
    const next = new Set(this.selectedMethods());
    if (next.has(m)) {
      if (next.size === 1) return; // al menos uno activo
      next.delete(m);
    } else {
      next.add(m);
    }
    this.selectedMethods.set(next);
  }

  isMethodActive(m: PaymentMethod): boolean {
    return this.selectedMethods().has(m);
  }

  allMethodsActive(): boolean {
    return this.selectedMethods().size === ALL_METHODS.length;
  }

  toggleAllMethods(): void {
    this.selectedMethods.set(
      this.allMethodsActive() ? new Set([ALL_METHODS[0]]) : new Set(ALL_METHODS),
    );
  }

  async applyFilters(): Promise<void> {
    this.loading.set(true);
    this.error.set(null);
    this.page.set(0);
    const filters: SalesReportFilters = {
      dateFrom: this.dateFrom(),
      dateTo: this.dateTo(),
      userId: this.selectedUserId(),
      productId: this.selectedProductId(),
      paymentMethods: this.allMethodsActive() ? [] : Array.from(this.selectedMethods()),
    };
    try {
      const [data, zeroCost] = await Promise.all([
        this.query.listOrders(filters),
        this.query.zeroCostProductCount(filters),
      ]);
      this.rows.set(data);
      this.summary.set(this.query.buildSummary(data));
      this.zeroCostCount.set(zeroCost);
      this.hasQueried.set(true);
    } catch (err: unknown) {
      this.error.set(errorMessage(err, 'Error al cargar el reporte'));
    } finally {
      this.loading.set(false);
    }
  }

  clearFilters(): void {
    this.dateFrom.set(this.defaultDateFrom());
    this.dateTo.set(this.today());
    this.selectedUserId.set('');
    this.selectedProductId.set('');
    this.selectedMethods.set(new Set(ALL_METHODS));
    void this.applyFilters();
  }

  async exportExcel(): Promise<void> {
    try {
      await this.exportSvc.exportSalesToExcel(this.rows(), this.summary(), this.dateRangeLabel());
    } catch (err: unknown) {
      this.error.set(errorMessage(err, 'No se pudo exportar a Excel'));
    }
  }

  async exportPdf(): Promise<void> {
    try {
      await this.exportSvc.exportSalesToPdf(this.rows(), this.summary(), this.dateRangeLabel());
    } catch (err: unknown) {
      this.error.set(errorMessage(err, 'No se pudo exportar a PDF'));
    }
  }

  prevPage(): void {
    if (this.page() > 0) this.page.update((p) => p - 1);
  }

  nextPage(): void {
    if (this.page() < this.totalPages() - 1) this.page.update((p) => p + 1);
  }

  goToPage(index: number): void {
    if (index < 0 || index >= this.totalPages()) return;
    this.page.set(index);
  }

  private today(): string {
    return new Date().toISOString().slice(0, 10);
  }

  private defaultDateFrom(): string {
    const d = new Date();
    d.setDate(1); // primer día del mes actual
    return d.toISOString().slice(0, 10);
  }
}
