import { inject, Injectable } from '@angular/core';
import { Employee, SalaryPayment } from '../../models/employee.model';
import { AuthService } from '../auth/auth.service';
import { SupabaseService } from '../supabase/supabase.service';

export interface CreateEmployeeInput {
  name: string;
  ci: string;
  phone: string | null;
  position: string;
  salary: number;
  hired_at: string;
}

export interface CreatePaymentInput {
  employee_id: string;
  amount: number;
  period_month: number;
  period_year: number;
  paid_at: string;
  notes: string | null;
}

@Injectable({ providedIn: 'root' })
export class StaffService {
  private readonly client = inject(SupabaseService).client;
  private readonly auth = inject(AuthService);

  private get businessId(): string {
    const id = this.auth.profile()?.business_id;
    if (!id) throw new Error('Sin negocio activo');
    return id;
  }

  async listEmployees(): Promise<Employee[]> {
    const { data, error } = await this.client
      .from('employees')
      .select('*')
      .eq('business_id', this.businessId)
      .order('name');
    if (error) throw error;
    return data as Employee[];
  }

  async createEmployee(input: CreateEmployeeInput): Promise<void> {
    const { error } = await this.client
      .from('employees')
      .insert({ ...input, business_id: this.businessId });
    if (error) throw error;
  }

  async updateEmployee(id: string, input: Partial<CreateEmployeeInput>): Promise<void> {
    const { error } = await this.client
      .from('employees')
      .update(input)
      .eq('id', id)
      .eq('business_id', this.businessId);
    if (error) throw error;
  }

  async deleteEmployee(id: string): Promise<void> {
    const { error } = await this.client
      .from('employees')
      .delete()
      .eq('id', id)
      .eq('business_id', this.businessId);
    if (error) throw error;
  }

  async listPayments(employeeId: string): Promise<SalaryPayment[]> {
    const { data, error } = await this.client
      .from('salary_payments')
      .select('*')
      .eq('employee_id', employeeId)
      .order('period_year', { ascending: false })
      .order('period_month', { ascending: false });
    if (error) throw error;
    return data as SalaryPayment[];
  }

  async createPayment(input: CreatePaymentInput): Promise<void> {
    const { error } = await this.client.from('salary_payments').insert(input);
    if (error) throw error;
  }

  async deletePayment(id: string): Promise<void> {
    const { error } = await this.client.from('salary_payments').delete().eq('id', id);
    if (error) throw error;
  }
}
