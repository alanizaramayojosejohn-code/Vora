import { ChangeDetectionStrategy, Component, computed, input } from '@angular/core';
import { CurrencyPipe, DatePipe } from '@angular/common';
import { DailyIncome } from '../../../../../../models/daily-income.model';
import { SkeletonRowsComponent } from '../../../../../shared/skeleton-rows.component';

@Component({
  selector: 'app-admin-reports-daily-income',
  imports: [SkeletonRowsComponent, CurrencyPipe, DatePipe],
  templateUrl: './daily-income.html',
  styleUrl: './daily-income.css',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class DailyIncomeCardComponent {
  readonly rows = input.required<DailyIncome[]>();
  readonly loading = input<boolean>(false);

  readonly sorted = computed(() =>
    this.rows().slice().sort((a, b) => b.day.localeCompare(a.day)),
  );
}
