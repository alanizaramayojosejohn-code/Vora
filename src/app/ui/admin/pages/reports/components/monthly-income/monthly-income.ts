import { ChangeDetectionStrategy, Component, computed, input } from '@angular/core';
import { CurrencyPipe, DatePipe } from '@angular/common';
import { MonthlyIncome } from '../../../../../../models/monthly-income.model';

interface MonthRow {
  month: string;
  product: number;
  membership: number;
  total: number;
  transactions: number;
}

@Component({
  selector: 'app-admin-reports-monthly-income',
  imports: [CurrencyPipe, DatePipe],
  templateUrl: './monthly-income.html',
  styleUrl: './monthly-income.css',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class MonthlyIncomeCardComponent {
  readonly rows = input.required<MonthlyIncome[]>();
  readonly loading = input<boolean>(false);

  // Pivot row-per-(month,type) → row-per-month con columnas de cada tipo.
  readonly pivoted = computed<MonthRow[]>(() => {
    const byMonth = new Map<string, MonthRow>();
    for (const r of this.rows()) {
      const existing = byMonth.get(r.month) ?? {
        month: r.month,
        product: 0,
        membership: 0,
        total: 0,
        transactions: 0,
      };
      if (r.type === 'product') existing.product += Number(r.total);
      else existing.membership += Number(r.total);
      existing.total += Number(r.total);
      existing.transactions += Number(r.transactions);
      byMonth.set(r.month, existing);
    }
    return Array.from(byMonth.values()).sort((a, b) => b.month.localeCompare(a.month));
  });
}
