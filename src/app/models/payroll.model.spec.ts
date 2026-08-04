import { describe, expect, it } from 'vitest';
import { Employee } from './employee.model';
import { buildPayrollStatus, PayrollPayment } from './payroll.model';

function employee(id: string, name: string, salary: number): Employee {
  return {
    id,
    business_id: 'biz-1',
    name,
    ci: '1234567',
    phone: null,
    position: 'Cajero',
    salary,
    hired_at: '2026-01-15',
    created_at: '2026-01-15T00:00:00Z',
  };
}

function payment(employeeId: string, amount: number): PayrollPayment {
  return {
    id: `pay-${employeeId}-${amount}`,
    business_id: 'biz-1',
    employee_id: employeeId,
    employee_name: 'x',
    employee_position: 'Cajero',
    amount,
    period_month: 8,
    period_year: 2026,
    paid_at: '2026-08-05',
    notes: null,
    created_at: '2026-08-05T00:00:00Z',
  };
}

describe('buildPayrollStatus', () => {
  it('marca como sin pagar al empleado que no tiene pagos en el mes', () => {
    const [row] = buildPayrollStatus([employee('e1', 'Ana', 2500)], []);

    expect(row.paid).toBe(0);
    expect(row.pending).toBe(2500);
    expect(row.isPaid).toBe(false);
  });

  it('suma varios pagos parciales del mismo empleado', () => {
    const [row] = buildPayrollStatus(
      [employee('e1', 'Ana', 2500)],
      [payment('e1', 1000), payment('e1', 800)],
    );

    expect(row.paid).toBe(1800);
    expect(row.pending).toBe(700);
    expect(row.isPaid).toBe(false);
  });

  it('un pago mayor al sueldo no genera pendiente negativo', () => {
    // Aguinaldo o bono: pagar de más no debe restar del total pendiente del
    // negocio ni mostrar un número en rojo al revés.
    const [row] = buildPayrollStatus([employee('e1', 'Ana', 2500)], [payment('e1', 4000)]);

    expect(row.pending).toBe(0);
    expect(row.isPaid).toBe(true);
  });

  it('incluye a todos los empleados aunque ninguno tenga pagos', () => {
    const rows = buildPayrollStatus(
      [employee('e1', 'Ana', 2500), employee('e2', 'Luis', 3000)],
      [payment('e1', 2500)],
    );

    expect(rows).toHaveLength(2);
    expect(rows.find((r) => r.employee.id === 'e2')?.isPaid).toBe(false);
  });

  it('ignora pagos de empleados que ya no están en la plantilla', () => {
    const rows = buildPayrollStatus([employee('e1', 'Ana', 2500)], [payment('e9', 999)]);

    expect(rows).toHaveLength(1);
    expect(rows[0].paid).toBe(0);
  });
});
