import { inject, Injectable } from '@angular/core';
import { Supplier } from '../../models/supplier.model';
import { AuthService } from '../auth/auth.service';
import { SupabaseService } from '../supabase/supabase.service';

export interface SupplierInput {
  name: string;
  contact: string | null;
  phone: string | null;
  email: string | null;
  notes: string | null;
}

@Injectable({ providedIn: 'root' })
export class SupplierService {
  private readonly client = inject(SupabaseService).client;
  private readonly auth = inject(AuthService);

  async createSupplier(input: SupplierInput): Promise<Supplier> {
    const businessId = this.auth.businessId();
    if (!businessId) throw new Error('Tu cuenta no tiene un negocio asignado.');
    const { data, error } = await this.client
      .from('suppliers')
      .insert({ business_id: businessId, ...input })
      .select('*')
      .single();
    if (error) throw error;
    return data as Supplier;
  }

  async updateSupplier(id: string, input: SupplierInput): Promise<void> {
    const { error } = await this.client.from('suppliers').update(input).eq('id', id);
    if (error) throw error;
  }

  async deleteSupplier(id: string): Promise<void> {
    const { error } = await this.client.from('suppliers').delete().eq('id', id);
    if (error) throw error;
  }

  async listSuppliers(): Promise<Supplier[]> {
    const { data, error } = await this.client
      .from('suppliers')
      .select('*')
      .order('name', { ascending: true });
    if (error) throw error;
    return (data ?? []) as Supplier[];
  }
}
