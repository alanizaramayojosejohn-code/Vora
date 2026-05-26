import { ChangeDetectionStrategy, Component, inject, signal } from '@angular/core';
import { DailyIncome } from '../../../../../models/daily-income.model';
import { LowStockProduct } from '../../../../../models/low-stock-product.model';
import { MonthlyIncome } from '../../../../../models/monthly-income.model';
import { ReportQueryService } from '../../../../../services/report/query.service';
import { DailyIncomeCardComponent } from '../components/daily-income/daily-income';
import { LowStockCardComponent } from '../components/low-stock/low-stock';
import { MonthlyIncomeCardComponent } from '../components/monthly-income/monthly-income';
import { SalesReportComponent } from '../components/sales-report/sales-report';

type ReportTab = 'resumen' | 'ventas';

@Component({
  selector: 'app-admin-reports',
  imports: [
    MonthlyIncomeCardComponent,
    DailyIncomeCardComponent,
    LowStockCardComponent,
    SalesReportComponent,
  ],
  templateUrl: './component.html',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class AdminReportsContainerComponent {
  private readonly reports = inject(ReportQueryService);

  readonly activeTab = signal<ReportTab>('ventas');

  readonly monthly = signal<MonthlyIncome[]>([]);
  readonly daily = signal<DailyIncome[]>([]);
  readonly lowStock = signal<LowStockProduct[]>([]);
  readonly loading = signal(false);

  constructor() {
    void this.refreshResumen();
  }

  setTab(tab: ReportTab): void {
    this.activeTab.set(tab);
    if (tab === 'resumen' && this.monthly().length === 0) {
      void this.refreshResumen();
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
