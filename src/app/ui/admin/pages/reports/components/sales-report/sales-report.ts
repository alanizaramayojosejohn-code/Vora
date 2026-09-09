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
import { ZeroCostNoticeComponent } from '../zero-cost-notice/zero-cost-notice';

const ALL_METHODS: PaymentMethod[] = ['cash', 'card', 'qr'];

@Component({
  selector: 'app-admin-sales-report',
  imports: [CurrencyPipe, DatePipe, DecimalPipe, FormsModule, ZeroCostNoticeComponent],
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
  readonly allMethods = ALL_METHODS;

  async ngOnInit(): Promise<void> {
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

  exportExcel(): void {
    this.exportSvc.exportSalesToExcel(this.rows(), this.summary(), this.dateRangeLabel());
  }

  exportPdf(): void {
    this.exportSvc.exportSalesToPdf(this.rows(), this.summary(), this.dateRangeLabel());
  }

  prevPage(): void {
    if (this.page() > 0) this.page.update((p) => p - 1);
  }

  nextPage(): void {
    if (this.page() < this.totalPages() - 1) this.page.update((p) => p + 1);
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
