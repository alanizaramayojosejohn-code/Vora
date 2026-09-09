import { ChangeDetectionStrategy, Component, computed, inject, signal } from '@angular/core';
import { SubscriptionStateService } from '../../../../../services/subscription/subscription-state.service';
import { CashSessionWithCashier } from '../../../../../models/cash-session.model';
import { DailyIncome } from '../../../../../models/daily-income.model';
import { LowStockProduct } from '../../../../../models/low-stock-product.model';
import { MonthlyIncome } from '../../../../../models/monthly-income.model';
import { PayrollMonth } from '../../../../../models/payroll.model';
import { CashSessionService } from '../../../../../services/cash-session/cash-session.service';
import { ReportQueryService } from '../../../../../services/report/query.service';
import { DailySalesQueryService } from '../../../../../services/report/daily-sales.query.service';
import { PayrollQueryService } from '../../../../../services/report/payroll.query.service';
import { CashSessionsReportComponent } from '../components/cash-sessions/cash-sessions';
import { ClientsReportComponent } from '../components/clients-report/clients-report';
import { DailyIncomeCardComponent } from '../components/daily-income/daily-income';
import { DailySalesReportComponent } from '../components/daily-sales/daily-sales';
import { LowStockCardComponent } from '../components/low-stock/low-stock';
import { MonthlyIncomeCardComponent } from '../components/monthly-income/monthly-income';
import { PayrollReportComponent } from '../components/payroll-report/payroll-report';
import { SalesReportComponent } from '../components/sales-report/sales-report';

type ReportTab = 'dia' | 'resumen' | 'ventas' | 'clientes' | 'planilla' | 'arqueos' | 'stock';

@Component({
  selector: 'app-admin-reports',
  imports: [
    MonthlyIncomeCardComponent,
    DailyIncomeCardComponent,
    LowStockCardComponent,
    SalesReportComponent,
    CashSessionsReportComponent,
    DailySalesReportComponent,
    ClientsReportComponent,
    PayrollReportComponent,
  ],
  templateUrl: './component.html',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class AdminReportsContainerComponent {
  private readonly reports = inject(ReportQueryService);
  private readonly sessions = inject(CashSessionService);
  private readonly payrollQuery = inject(PayrollQueryService);
  private readonly subscriptionState = inject(SubscriptionStateService);

  // Plan Caja incluye "reportes básicos": ventas del día, bajo stock y arqueos.
  // El detalle de ventas con filtros libres, los ingresos diario/mensual, los
  // reportes de clientes y la exportación son de Negocio.
  readonly hasAdvancedReports = computed(() => this.subscriptionState.allows('advanced_reports'));

  // La planilla se ata a la feature de personal, no a la de reportes: sin el
  // módulo de personal no hay empleados que reportar.
  readonly hasStaff = computed(() => this.subscriptionState.allows('staff'));

  // Arranca en "Hoy", que existe en los dos planes. Antes el tab inicial era
  // uno exclusivo de Negocio y había que corregirlo cuando resolvía la carga
  // de la suscripción; con un default común esa carrera desaparece.
  readonly activeTab = signal<ReportTab>('dia');

  readonly monthly = signal<MonthlyIncome[]>([]);
  readonly daily = signal<DailyIncome[]>([]);
  readonly lowStock = signal<LowStockProduct[]>([]);
  readonly loading = signal(false);

  // Sueldos por mes, para cruzar contra la ganancia mensual (RF-14). Solo se
  // pide con el módulo de personal habilitado: sin él nunca hay sueldos que
  // restar (RF-16), y pedirlo igual sería una consulta que siempre vuelve vacía.
  readonly payrollMonthly = signal<PayrollMonth[]>([]);

  // Cuántos productos vendidos en el rango visible no tienen costo cargado
  // (RF-22/23), uno por tarjeta porque cada una muestra un rango distinto
  // (30 días vs. 12 meses).
  readonly dailyZeroCost = signal<number | null>(null);
  readonly monthlyZeroCost = signal<number | null>(null);

  readonly cashSessions = signal<CashSessionWithCashier[]>([]);
  readonly loadingSessions = signal(false);

  constructor() {
    void this.subscriptionState.ensureLoaded();
    // Solo el bajo stock se precarga: es lo único del resumen que los dos
    // planes pueden ver. Los ingresos diario y mensual se piden recién al
    // abrir su pestaña — antes se traían siempre, incluso en plan Caja, que
    // ni siquiera los muestra.
    void this.refreshLowStock();
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

  async refreshLowStock(): Promise<void> {
    this.loading.set(true);
    try {
      this.lowStock.set(await this.reports.listLowStockProducts());
    } catch (err: unknown) {
      console.error('Error cargando bajo stock', err);
    } finally {
      this.loading.set(false);
    }
  }

  async refreshResumen(): Promise<void> {
    this.loading.set(true);
    try {
      const today = DailySalesQueryService.localDate(new Date());
      const dailyFrom = DailySalesQueryService.localDate(daysAgo(30));
      const monthlyFrom = DailySalesQueryService.localDate(monthsAgoStart(12));

      await Promise.all([
        this.reports.listMonthlyIncome().then((v) => this.monthly.set(v)),
        this.reports.listDailyIncome().then((v) => this.daily.set(v)),
        this.reports.listLowStockProducts().then((v) => this.lowStock.set(v)),
        this.reports.zeroCostProductCount(dailyFrom, today).then((v) => this.dailyZeroCost.set(v)),
        this.reports.zeroCostProductCount(monthlyFrom, today).then((v) => this.monthlyZeroCost.set(v)),
        this.hasStaff()
          ? this.payrollQuery.listMonthly(12).then((v) => this.payrollMonthly.set(v))
          : Promise.resolve(),
      ]);
    } catch (err: unknown) {
      console.error('Error cargando reports', err);
    } finally {
      this.loading.set(false);
    }
  }
}

function daysAgo(days: number): Date {
  const d = new Date();
  d.setDate(d.getDate() - days);
  return d;
}

function monthsAgoStart(months: number): Date {
  const d = new Date();
  d.setMonth(d.getMonth() - months);
  d.setDate(1);
  return d;
}
