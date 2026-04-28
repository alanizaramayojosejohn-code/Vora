import { inject, Injectable } from '@angular/core';
import { Business } from '../../models/business.model';
import { SupabaseService } from '../supabase/supabase.service';

@Injectable({ providedIn: 'root' })
export class BusinessQueryService {
  private readonly client = inject(SupabaseService).client;

  async listBusinesses(): Promise<Business[]> {
    const { data, error } = await this.client
      .from('businesses')
      .select('*')
      .order('created_at', { ascending: false });
    if (error) throw error;
    return (data ?? []) as Business[];
  }
}
