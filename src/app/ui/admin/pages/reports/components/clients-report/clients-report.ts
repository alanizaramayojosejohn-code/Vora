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
  ClientCoverage,
  ClientSalesSummary,
  daysSinceLastPurchase,
  INACTIVE_CLIENT_DAYS,
} from '../../../../../../models/client-sales.model';
import { ClientReportQueryService } from '../../../../../../services/report/client-report.query.service';
import { ExportService } from '../../../../../../services/export/export.service';
import { errorMessage } from '../../../../../../utilities/error-message';
import { SkeletonRowsComponent } from '../../../../../shared/skeleton-rows.component';

type ClientView = 'top' | 'inactivos' | 'nuevos';

@Component({
  selector: 'app-admin-reports-clients',
  imports: [SkeletonRowsComponent, CurrencyPipe, DatePipe, DecimalPipe],
  templateUrl: './clients-report.html',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class ClientsReportComponent implements OnInit {
  private readonly query = inject(ClientReportQueryService);
  private readonly exportSvc = inject(ExportService);

  readonly inactiveDays = INACTIVE_CLIENT_DAYS;

  readonly rows = signal<ClientSalesSummary[]>([]);
  readonly coverage = signal<ClientCoverage | null>(null);
  readonly loading = signal(false);
  readonly error = signal<string | null>(null);
  readonly view = signal<ClientView>('top');

  // La vista ya ordena por gasto, así que "top" es la lista tal cual llega.
  readonly topClients = computed(() => this.rows().filter((r) => r.orders_count > 0));

  // Compraron alguna vez pero hace más de 30 días. Los que nunca compraron van
  // aparte: no están "inactivos", nunca arrancaron, y mezclarlos convertiría la
  // lista en un volcado de la cartera entera.
  readonly inactiveClients = computed(() =>
    this.rows()
      .filter((r) => {
        const days = daysSinceLastPurchase(r);
        return days !== null && days >= INACTIVE_CLIENT_DAYS;
      })
      .sort((a, b) => (daysSinceLastPurchase(b) ?? 0) - (daysSinceLastPurchase(a) ?? 0)),
  );

  readonly neverBought = computed(() => this.rows().filter((r) => r.orders_count === 0));

  readonly visibleRows = computed(() => {
    switch (this.view()) {
      case 'inactivos': return this.inactiveClients();
      case 'nuevos':    return this.neverBought();
      default:          return this.topClients();
    }
  });

  readonly totalClients = computed(() => this.rows().length);
  readonly activeClients = computed(() => this.topClients().length);

  readonly avgTicketOverall = computed(() => {
    const active = this.topClients();
    if (active.length === 0) return 0;
    const spent = active.reduce((s, r) => s + r.total_spent, 0);
    const orders = active.reduce((s, r) => s + r.orders_count, 0);
    return orders === 0 ? 0 : spent / orders;
  });

  readonly daysSince = daysSinceLastPurchase;

  async ngOnInit(): Promise<void> {
    await this.refresh();
  }

  setView(view: ClientView): void {
    this.view.set(view);
  }

  async refresh(): Promise<void> {
    this.loading.set(true);
    this.error.set(null);
    try {
      const [rows, coverage] = await Promise.all([
        this.query.listSummary(),
        this.query.coverage(),
      ]);
      this.rows.set(rows);
      this.coverage.set(coverage);
    } catch (err: unknown) {
      this.error.set(errorMessage(err, 'No se pudo cargar el reporte de clientes'));
    } finally {
      this.loading.set(false);
    }
  }

  exportExcel(): void {
    this.exportSvc.exportClientsToExcel(this.visibleRows(), this.viewLabel());
  }

  exportPdf(): void {
    this.exportSvc.exportClientsToPdf(this.visibleRows(), this.viewLabel());
  }

  viewLabel(): string {
    switch (this.view()) {
      case 'inactivos': return `Sin comprar hace ${INACTIVE_CLIENT_DAYS} días o más`;
      case 'nuevos':    return 'Clientes sin compras';
      default:          return 'Clientes por gasto total';
    }
  }
}
