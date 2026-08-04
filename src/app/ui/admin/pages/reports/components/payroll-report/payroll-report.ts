import {
  ChangeDetectionStrategy,
  Component,
  computed,
  inject,
  OnInit,
  signal,
} from '@angular/core';
import { CurrencyPipe, DatePipe, DecimalPipe } from '@angular/common';
import { Employee } from '../../../../../../models/employee.model';
import { MonthlyIncome } from '../../../../../../models/monthly-income.model';
import {
  buildPayrollStatus,
  monthLabel,
  MONTH_LABELS,
  PayrollPayment,
  PayrollStatusRow,
} from '../../../../../../models/payroll.model';
import { ExportService } from '../../../../../../services/export/export.service';
import { PayrollQueryService } from '../../../../../../services/report/payroll.query.service';
import { ReportQueryService } from '../../../../../../services/report/query.service';
import { StaffService } from '../../../../../../services/staff/staff.service';
import { errorMessage } from '../../../../../../utilities/error-message';

@Component({
  selector: 'app-admin-reports-payroll',
  imports: [CurrencyPipe, DatePipe, DecimalPipe],
  templateUrl: './payroll-report.html',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class PayrollReportComponent implements OnInit {
  private readonly payroll = inject(PayrollQueryService);
  private readonly staff = inject(StaffService);
  private readonly reports = inject(ReportQueryService);
  private readonly exportSvc = inject(ExportService);

  readonly monthLabels = MONTH_LABELS;
  readonly monthLabel = monthLabel;

  private readonly now = new Date();
  readonly year = signal(this.now.getFullYear());
  readonly month = signal(this.now.getMonth() + 1);

  readonly employees = signal<Employee[]>([]);
  readonly payments = signal<PayrollPayment[]>([]);
  readonly monthlyIncome = signal<MonthlyIncome[]>([]);
  readonly loading = signal(false);
  readonly error = signal<string | null>(null);

  // Años ofrecidos en el selector: el actual y los dos anteriores. Más atrás
  // no hay datos que valgan — el módulo de personal es reciente.
  readonly years = computed(() => {
    const current = this.now.getFullYear();
    return [current, current - 1, current - 2];
  });

  readonly status = computed<PayrollStatusRow[]>(() =>
    buildPayrollStatus(this.employees(), this.payments()),
  );

  readonly totalPaid = computed(() =>
    this.payments().reduce((sum, p) => sum + Number(p.amount), 0),
  );

  readonly totalExpected = computed(() =>
    this.employees().reduce((sum, e) => sum + Number(e.salary), 0),
  );

  readonly pendingRows = computed(() => this.status().filter((r) => r.pending > 0));

  readonly totalPending = computed(() =>
    this.pendingRows().reduce((sum, r) => sum + r.pending, 0),
  );

  // Ingresos del mes seleccionado, para poner la planilla en contexto. Un
  // total de sueldos sin comparar contra lo que entró no dice nada.
  readonly incomeThisMonth = computed(() => {
    const target = `${this.year()}-${String(this.month()).padStart(2, '0')}`;
    return this.monthlyIncome()
      .filter((m) => m.month.startsWith(target))
      .reduce((sum, m) => sum + Number(m.total), 0);
  });

  readonly laborCostShare = computed<number | null>(() => {
    const income = this.incomeThisMonth();
    if (income <= 0) return null;
    return (this.totalPaid() / income) * 100;
  });

  readonly headcount = computed(() => this.employees().length);

  readonly avgSalary = computed(() => {
    const list = this.employees();
    if (list.length === 0) return 0;
    return list.reduce((sum, e) => sum + Number(e.salary), 0) / list.length;
  });

  // Antigüedad promedio en meses. En meses y no en años porque una plantilla
  // joven en años se ve toda como "0".
  readonly avgTenureMonths = computed(() => {
    const list = this.employees();
    if (list.length === 0) return 0;
    const now = Date.now();
    const total = list.reduce((sum, e) => {
      const hired = new Date(e.hired_at).getTime();
      return sum + (now - hired) / (1000 * 60 * 60 * 24 * 30.44);
    }, 0);
    return total / list.length;
  });

  readonly periodLabel = computed(() => `${monthLabel(this.month())} ${this.year()}`);

  async ngOnInit(): Promise<void> {
    await this.refresh();
  }

  async setPeriod(year: number, month: number): Promise<void> {
    this.year.set(year);
    this.month.set(month);
    await this.refresh();
  }

  onYearChange(value: string): void {
    void this.setPeriod(Number(value), this.month());
  }

  onMonthChange(value: string): void {
    void this.setPeriod(this.year(), Number(value));
  }

  async refresh(): Promise<void> {
    this.loading.set(true);
    this.error.set(null);
    try {
      const [employees, payments, income] = await Promise.all([
        this.staff.listEmployees(),
        this.payroll.listPayments(this.year(), this.month()),
        this.reports.listMonthlyIncome(12),
      ]);
      this.employees.set(employees);
      this.payments.set(payments);
      this.monthlyIncome.set(income);
    } catch (err: unknown) {
      this.error.set(errorMessage(err, 'No se pudo cargar el reporte de planilla'));
    } finally {
      this.loading.set(false);
    }
  }

  exportExcel(): void {
    this.exportSvc.exportPayrollToExcel(this.status(), this.payments(), this.periodLabel());
  }

  exportPdf(): void {
    this.exportSvc.exportPayrollToPdf(this.status(), this.payments(), this.periodLabel());
  }
}
