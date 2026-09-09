import { inject, Injectable } from '@angular/core';
import { Table } from '../../models/table.model';
import { AuthService } from '../auth/auth.service';
import { SupabaseService } from '../supabase/supabase.service';

export interface CreateTableInput {
  name: string;
  is_active: boolean;
}

export type UpdateTableInput = CreateTableInput;

@Injectable({ providedIn: 'root' })
export class TableService {
  private readonly client = inject(SupabaseService).client;
  private readonly auth = inject(AuthService);

  async createTable(input: CreateTableInput): Promise<Table> {
    const businessId = this.auth.businessId();
    if (!businessId) throw new Error('Tu cuenta no tiene un negocio asignado.');

    const { data, error } = await this.client
      .from('tables')
      .insert({ business_id: businessId, name: input.name, is_active: input.is_active })
      .select('*')
      .single();
    if (error) throw error;
    return data as Table;
  }

  // Desactivar una mesa con un pendiente abierto lo rechaza un trigger en
  // Postgres (RF-3); el mensaje que llega acá ya es el que se le muestra al
  // usuario.
  async updateTable(id: string, input: UpdateTableInput): Promise<Table> {
    const { data, error } = await this.client
      .from('tables')
      .update({ name: input.name, is_active: input.is_active })
      .eq('id', id)
      .select('*')
      .single();
    if (error) throw error;
    return data as Table;
  }

  async deleteTable(id: string): Promise<void> {
    const { error } = await this.client.from('tables').delete().eq('id', id);
    if (error) throw error;
  }
}
