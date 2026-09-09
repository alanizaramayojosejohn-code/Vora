import { ChangeDetectionStrategy, Component, computed, input } from '@angular/core';
import { CurrencyPipe, DatePipe, DecimalPipe } from '@angular/common';
import { DailyIncome } from '../../../../../../models/daily-income.model';
import { computeMargin } from '../../../../../../models/profit.model';
import { SkeletonRowsComponent } from '../../../../../shared/skeleton-rows.component';
import { ZeroCostNoticeComponent } from '../zero-cost-notice/zero-cost-notice';

interface DailyIncomeRow extends DailyIncome {
  margin: number | null;
}

@Component({
  selector: 'app-admin-reports-daily-income',
  imports: [SkeletonRowsComponent, ZeroCostNoticeComponent, CurrencyPipe, DatePipe, DecimalPipe],
  templateUrl: './daily-income.html',
  styleUrl: './daily-income.css',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class DailyIncomeCardComponent {
  readonly rows = input.required<DailyIncome[]>();
  readonly zeroCostCount = input<number | null>(null);
  readonly loading = input<boolean>(false);

  readonly sorted = computed<DailyIncomeRow[]>(() =>
    this.rows()
      .slice()
      .sort((a, b) => b.day.localeCompare(a.day))
      .map((row) => ({ ...row, margin: computeMargin(row.profit, row.total) })),
  );
}
