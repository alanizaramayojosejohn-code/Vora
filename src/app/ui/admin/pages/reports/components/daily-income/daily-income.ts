import { ChangeDetectionStrategy, Component, computed, input } from '@angular/core';
import { CurrencyPipe, DatePipe } from '@angular/common';
import { DailyIncome } from '../../../../../../models/daily-income.model';

interface DayRow {
  day: string;
  product: number;
  membership: number;
  total: number;
  transactions: number;
}

@Component({
  selector: 'app-admin-reports-daily-income',
  imports: [CurrencyPipe, DatePipe],
  templateUrl: './daily-income.html',
  styleUrl: './daily-income.css',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class DailyIncomeCardComponent {
  readonly rows = input.required<DailyIncome[]>();
  readonly loading = input<boolean>(false);

  // Pivot row-per-(day,type) → row-per-day.
  readonly pivoted = computed<DayRow[]>(() => {
    const byDay = new Map<string, DayRow>();
    for (const r of this.rows()) {
      const existing = byDay.get(r.day) ?? {
        day: r.day,
        product: 0,
        membership: 0,
        total: 0,
        transactions: 0,
      };
      if (r.type === 'product') existing.product += Number(r.total);
      else existing.membership += Number(r.total);
      existing.total += Number(r.total);
      existing.transactions += Number(r.transactions);
      byDay.set(r.day, existing);
    }
    return Array.from(byDay.values()).sort((a, b) => b.day.localeCompare(a.day));
  });
}
