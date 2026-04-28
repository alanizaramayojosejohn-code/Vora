import { inject, Injectable } from '@angular/core';
import { Service } from '../../models/service.model';
import { SupabaseService } from '../supabase/supabase.service';

@Injectable({ providedIn: 'root' })
export class ServiceQueryService {
  private readonly client = inject(SupabaseService).client;

  // RLS filtra por business_id del caller automáticamente.
  async listServices(): Promise<Service[]> {
    const { data, error } = await this.client
      .from('services')
      .select('*')
      .order('name', { ascending: true });
    if (error) throw error;
    return (data ?? []) as Service[];
  }
}
