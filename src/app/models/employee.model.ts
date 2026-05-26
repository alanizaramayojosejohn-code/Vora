export interface Employee {
  id: string;
  business_id: string;
  name: string;
  ci: string;
  phone: string | null;
  position: string;
  salary: number;
  hired_at: string;
  created_at: string;
}

export interface SalaryPayment {
  id: string;
  employee_id: string;
  amount: number;
  period_month: number;
  period_year: number;
  paid_at: string;
  notes: string | null;
  created_at: string;
}
