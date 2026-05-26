import { CurrencyPipe, DatePipe } from '@angular/common';
import { ChangeDetectionStrategy, Component, computed, input, output } from '@angular/core';
import { Employee, SalaryPayment } from '../../../../../../models/employee.model';

const MONTHS = ['', 'Enero', 'Febrero', 'Marzo', 'Abril', 'Mayo', 'Junio',
  'Julio', 'Agosto', 'Septiembre', 'Octubre', 'Noviembre', 'Diciembre'];

@Component({
  selector: 'app-admin-staff-payments-history',
  imports: [DatePipe, CurrencyPipe],
  templateUrl: './payments-history.html',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class PaymentsHistoryComponent {
  readonly employee = input.required<Employee>();
  readonly payments = input<SalaryPayment[]>([]);
  readonly loading = input<boolean>(false);
  readonly close = output<void>();
  readonly addPayment = output<void>();
  readonly deletePayment = output<SalaryPayment>();

  readonly total = computed(() => this.payments().reduce((acc, p) => acc + p.amount, 0));

  monthName(m: number): string { return MONTHS[m] ?? ''; }
}
