import { ChangeDetectionStrategy, Component, computed, inject, signal } from '@angular/core';
import { ActiveMembership } from '../../../../../models/active-membership.model';
import { DailyIncome } from '../../../../../models/daily-income.model';
import { LowStockProduct } from '../../../../../models/low-stock-product.model';
import { MonthlyIncome } from '../../../../../models/monthly-income.model';
import { AuthService } from '../../../../../services/auth/auth.service';
import { ReportQueryService } from '../../../../../services/report/query.service';
import { ActiveMembershipsCardComponent } from '../components/active-memberships/active-memberships';
import { DailyIncomeCardComponent } from '../components/daily-income/daily-income';
import { LowStockCardComponent } from '../components/low-stock/low-stock';
import { MonthlyIncomeCardComponent } from '../components/monthly-income/monthly-income';

@Component({
  selector: 'app-admin-reports',
  imports: [
    MonthlyIncomeCardComponent,
    DailyIncomeCardComponent,
    ActiveMembershipsCardComponent,
    LowStockCardComponent,
  ],
  templateUrl: './component.html',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class AdminReportsContainerComponent {
  private readonly reports = inject(ReportQueryService);
  private readonly auth = inject(AuthService);

  readonly monthly = signal<MonthlyIncome[]>([]);
  readonly daily = signal<DailyIncome[]>([]);
  readonly active = signal<ActiveMembership[]>([]);
  readonly lowStock = signal<LowStockProduct[]>([]);
  readonly loading = signal(false);
  readonly isGym = computed(() => this.auth.businessType() === 'gym');

  constructor() {
    void this.refresh();
  }

  async refresh(): Promise<void> {
    this.loading.set(true);
    try {
      const tasks: Promise<unknown>[] = [
        this.reports.listMonthlyIncome().then((v) => this.monthly.set(v)),
        this.reports.listDailyIncome().then((v) => this.daily.set(v)),
        this.reports.listLowStockProducts().then((v) => this.lowStock.set(v)),
      ];
      if (this.isGym()) {
        tasks.push(
          this.reports.listActiveMemberships().then((v) => this.active.set(v)),
        );
      }
      await Promise.all(tasks);
    } catch (err: unknown) {
      console.error('Error cargando reports', err);
    } finally {
      this.loading.set(false);
    }
  }
}
