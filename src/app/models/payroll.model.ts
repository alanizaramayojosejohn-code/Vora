import { Employee } from './employee.model';

// Fila de la vista payroll_payments: un pago con el empleado ya resuelto.
export interface PayrollPayment {
  id: string;
  business_id: string;
  employee_id: string;
  employee_name: string;
  employee_position: string;
  amount: number;
  period_month: number;
  period_year: number;
  paid_at: string;
  notes: string | null;
  created_at: string;
}

// Fila de la vista payroll_monthly.
export interface PayrollMonth {
  business_id: string;
  period_year: number;
  period_month: number;
  total_paid: number;
  employees_paid: number;
}

// Estado de un empleado dentro de un mes concreto: la pregunta que el dueño
// hace de verdad es "¿a quién me falta pagarle?".
export interface PayrollStatusRow {
  employee: Employee;
  expected: number;      // employees.salary
  paid: number;          // suma de pagos del mes
  pending: number;       // expected - paid, nunca negativo
  isPaid: boolean;
}

export const MONTH_LABELS = [
  'Enero', 'Febrero', 'Marzo', 'Abril', 'Mayo', 'Junio',
  'Julio', 'Agosto', 'Septiembre', 'Octubre', 'Noviembre', 'Diciembre',
] as const;

export function monthLabel(month: number): string {
  return MONTH_LABELS[month - 1] ?? String(month);
}

// Cruza plantilla contra pagos del mes. Se hace en el cliente a propósito: los
// empleados son decenas, no miles, y ambas listas ya están cargadas — un RPC
// extra sería una ida al servidor para ahorrar un bucle.
export function buildPayrollStatus(
  employees: Employee[],
  payments: PayrollPayment[],
): PayrollStatusRow[] {
  const paidByEmployee = new Map<string, number>();
  for (const p of payments) {
    paidByEmployee.set(p.employee_id, (paidByEmployee.get(p.employee_id) ?? 0) + Number(p.amount));
  }

  return employees.map((employee) => {
    const expected = Number(employee.salary);
    const paid = paidByEmployee.get(employee.id) ?? 0;
    return {
      employee,
      expected,
      paid,
      // Un pago mayor al sueldo (bono, aguinaldo) no deja "pendiente negativo".
      pending: Math.max(0, expected - paid),
      isPaid: paid > 0 && paid >= expected,
    };
  });
}
