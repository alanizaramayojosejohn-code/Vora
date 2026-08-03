import { ChangeDetectionStrategy, Component, computed, inject, signal } from '@angular/core';
import { SubscriptionStateService } from '../../../../../services/subscription/subscription-state.service';
import { CashSessionWithCashier } from '../../../../../models/cash-session.model';
import { DailyIncome } from '../../../../../models/daily-income.model';
import { LowStockProduct } from '../../../../../models/low-stock-product.model';
import { MonthlyIncome } from '../../../../../models/monthly-income.model';
import { CashSessionService } from '../../../../../services/cash-session/cash-session.service';
import { ReportQueryService } from '../../../../../services/report/query.service';
import { CashSessionsReportComponent } from '../components/cash-sessions/cash-sessions';
import { DailyIncomeCardComponent } from '../components/daily-income/daily-income';
import { LowStockCardComponent } from '../components/low-stock/low-stock';
import { MonthlyIncomeCardComponent } from '../components/monthly-income/monthly-income';
import { SalesReportComponent } from '../components/sales-report/sales-report';

type ReportTab = 'resumen' | 'ventas' | 'arqueos' | 'stock';

@Component({
  selector: 'app-admin-reports',
  imports: [
    MonthlyIncomeCardComponent,
    DailyIncomeCardComponent,
    LowStockCardComponent,
    SalesReportComponent,
    CashSessionsReportComponent,
  ],
  templateUrl: './component.html',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class AdminReportsContainerComponent {
  private readonly reports = inject(ReportQueryService);
  private readonly sessions = inject(CashSessionService);
  private readonly subscriptionState = inject(SubscriptionStateService);

  // Plan Caja incluye "reportes básicos": bajo stock y arqueos de caja.
  // Diario, mensual, reporte de ventas y exportación son de Negocio.
  readonly hasAdvancedReports = computed(() => this.subscriptionState.allows('advanced_reports'));

  readonly activeTab = signal<ReportTab>('ventas');

  readonly monthly = signal<MonthlyIncome[]>([]);
  readonly daily = signal<DailyIncome[]>([]);
  readonly lowStock = signal<LowStockProduct[]>([]);
  readonly loading = signal(false);

  readonly cashSessions = signal<CashSessionWithCashier[]>([]);
  readonly loadingSessions = signal(false);

  constructor() {
    void this.subscriptionState.ensureLoaded().then(() => {
      // Sin reportes avanzados la pestaña de ventas no existe: se arranca en
      // la que sí está disponible.
      if (!this.hasAdvancedReports()) this.activeTab.set('arqueos');
    });
    void this.refreshResumen();
  }

  setTab(tab: ReportTab): void {
    this.activeTab.set(tab);
    if (tab === 'resumen' && this.monthly().length === 0) {
      void this.refreshResumen();
    }
    if (tab === 'arqueos' && this.cashSessions().length === 0) {
      void this.refreshCashSessions();
    }
  }

  async refreshCashSessions(): Promise<void> {
    this.loadingSessions.set(true);
    try {
      this.cashSessions.set(await this.sessions.listSessions());
    } catch (err: unknown) {
      console.error('Error cargando arqueos', err);
    } finally {
      this.loadingSessions.set(false);
    }
  }

  async refreshResumen(): Promise<void> {
    this.loading.set(true);
    try {
      await Promise.all([
        this.reports.listMonthlyIncome().then((v) => this.monthly.set(v)),
        this.reports.listDailyIncome().then((v) => this.daily.set(v)),
        this.reports.listLowStockProducts().then((v) => this.lowStock.set(v)),
      ]);
    } catch (err: unknown) {
      console.error('Error cargando reports', err);
    } finally {
      this.loading.set(false);
    }
  }
}
