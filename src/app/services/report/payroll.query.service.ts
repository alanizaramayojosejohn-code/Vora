import { inject, Injectable } from '@angular/core';
import { PayrollMonth, PayrollPayment } from '../../models/payroll.model';
import { SupabaseService } from '../supabase/supabase.service';

@Injectable({ providedIn: 'root' })
export class PayrollQueryService {
  private readonly client = inject(SupabaseService).client;

  // Pagos de un mes concreto, con el empleado ya resuelto por la vista.
  // salary_payments no tiene business_id — cuelga de employees — y sin la
  // vista habría que traerse los empleados primero solo para armar un `in`.
  async listPayments(year: number, month: number): Promise<PayrollPayment[]> {
    const { data, error } = await this.client
      .from('payroll_payments')
      .select('*')
      .eq('period_year', year)
      .eq('period_month', month)
      .order('paid_at', { ascending: false });
    if (error) throw error;

    return (data ?? []).map((row: PayrollPayment) => ({
      ...row,
      amount: Number(row.amount),
    }));
  }

  // Serie mensual para el gráfico y para comparar contra los ingresos.
  async listMonthly(months = 12): Promise<PayrollMonth[]> {
    const { data, error } = await this.client
      .from('payroll_monthly')
      .select('*')
      .order('period_year', { ascending: false })
      .order('period_month', { ascending: false })
      .limit(months);
    if (error) throw error;

    return (data ?? []).map((row: PayrollMonth) => ({
      ...row,
      total_paid: Number(row.total_paid),
    }));
  }

  // Historial de un empleado. Se acota a 24 meses porque el caso de uso es
  // resolver un reclamo o un finiquito, no auditar toda la vida laboral.
  async listByEmployee(employeeId: string, limit = 24): Promise<PayrollPayment[]> {
    const { data, error } = await this.client
      .from('payroll_payments')
      .select('*')
      .eq('employee_id', employeeId)
      .order('period_year', { ascending: false })
      .order('period_month', { ascending: false })
      .limit(limit);
    if (error) throw error;

    return (data ?? []).map((row: PayrollPayment) => ({
      ...row,
      amount: Number(row.amount),
    }));
  }
}
