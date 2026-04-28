import { inject, Injectable } from '@angular/core';
import { Client } from '../../models/client.model';
import { SupabaseService } from '../supabase/supabase.service';

@Injectable({ providedIn: 'root' })
export class ClientQueryService {
  private readonly client = inject(SupabaseService).client;

  // RLS filtra por business_id del caller automáticamente.
  async listClients(): Promise<Client[]> {
    const { data, error } = await this.client
      .from('clients')
      .select('*')
      .order('created_at', { ascending: false });
    if (error) throw error;
    return (data ?? []) as Client[];
  }
}
