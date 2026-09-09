import { ChangeDetectionStrategy, Component, computed, input } from '@angular/core';
import { CurrencyPipe, DatePipe } from '@angular/common';
import { MonthlyIncome } from '../../../../../../models/monthly-income.model';
import { PayrollMonth } from '../../../../../../models/payroll.model';
import { computeMargin, netProfitAfterPayroll } from '../../../../../../models/profit.model';
import { SkeletonRowsComponent } from '../../../../../shared/skeleton-rows.component';
import { ZeroCostNoticeComponent } from '../zero-cost-notice/zero-cost-notice';

interface MonthlyIncomeRow extends MonthlyIncome {
  margin: number | null;
  // null cuando el negocio no registró sueldos ese mes (RF-16): la fila no
  // muestra la columna de utilidad, en vez de restar un cero que sugeriría
  // "no hay sueldos que pagar" en lugar de "no se cargaron".
  payrollPaid: number | null;
  netProfit: number | null;
}

@Component({
  selector: 'app-admin-reports-monthly-income',
  imports: [SkeletonRowsComponent, ZeroCostNoticeComponent, CurrencyPipe, DatePipe],
  templateUrl: './monthly-income.html',
  styleUrl: './monthly-income.css',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class MonthlyIncomeCardComponent {
  readonly rows = input.required<MonthlyIncome[]>();
  readonly payroll = input<PayrollMonth[]>([]);
  readonly zeroCostCount = input<number | null>(null);
  readonly loading = input<boolean>(false);

  readonly sorted = computed<MonthlyIncomeRow[]>(() => {
    // period_year/period_month son enteros; row.month es un timestamp del
    // primer día del mes en hora de Bolivia — de ahí sale el mismo par.
    const payrollByPeriod = new Map(
      this.payroll().map((p) => [`${p.period_year}-${p.period_month}`, Number(p.total_paid)]),
    );

    return this.rows()
      .slice()
      .sort((a, b) => b.month.localeCompare(a.month))
      .map((row) => {
        // Se lee el string directo, no `new Date(row.month).getMonth()`: ese
        // parseo interpreta el timestamp en la zona horaria del NAVEGADOR, y
        // en uno con offset muy negativo (ej. UTC-10) el 1º del mes a
        // medianoche de Bolivia podría leerse como el día anterior — el mes
        // resultante sería el equivocado. El string ISO ya trae el año-mes
        // correcto tal como lo calculó la vista.
        const year = Number(row.month.slice(0, 4));
        const month = Number(row.month.slice(5, 7));
        const payrollPaid = payrollByPeriod.get(`${year}-${month}`) ?? null;
        return {
          ...row,
          margin: computeMargin(row.profit, row.total),
          payrollPaid,
          netProfit: netProfitAfterPayroll(row.profit, payrollPaid),
        };
      });
  });
}
