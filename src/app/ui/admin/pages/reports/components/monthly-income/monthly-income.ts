import { ChangeDetectionStrategy, Component, computed, input } from '@angular/core';
import { CurrencyPipe, DatePipe } from '@angular/common';
import { MonthlyIncome } from '../../../../../../models/monthly-income.model';
import { SkeletonRowsComponent } from '../../../../../shared/skeleton-rows.component';

@Component({
  selector: 'app-admin-reports-monthly-income',
  imports: [SkeletonRowsComponent, CurrencyPipe, DatePipe],
  templateUrl: './monthly-income.html',
  styleUrl: './monthly-income.css',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class MonthlyIncomeCardComponent {
  readonly rows = input.required<MonthlyIncome[]>();
  readonly loading = input<boolean>(false);

  readonly sorted = computed(() =>
    this.rows().slice().sort((a, b) => b.month.localeCompare(a.month)),
  );
}
