import { inject, Injectable } from '@angular/core';
import { Client } from '../../models/client.model';
import { AuthService } from '../auth/auth.service';
import { SupabaseService } from '../supabase/supabase.service';

export interface CreateClientInput {
  ci: string;
  name: string;
  phone: string | null;
}

@Injectable({ providedIn: 'root' })
export class ClientService {
  private readonly client = inject(SupabaseService).client;
  private readonly auth = inject(AuthService);

  async createClient(input: CreateClientInput): Promise<Client> {
    const businessId = this.auth.businessId();
    if (!businessId) throw new Error('Tu cuenta no tiene un negocio asignado.');

    const { data, error } = await this.client
      .from('clients')
      .insert({
        business_id: businessId,
        ci: input.ci,
        name: input.name,
        phone: input.phone,
      })
      .select('*')
      .single();
    if (error) throw error;
    return data as Client;
  }
}
