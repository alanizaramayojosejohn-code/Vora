import { inject, Injectable } from '@angular/core';
import { Profile } from '../../models/profile.model';
import { SupabaseService } from '../supabase/supabase.service';

@Injectable({ providedIn: 'root' })
export class ProfileQueryService {
  private readonly client = inject(SupabaseService).client;

  // RLS filtra a profiles del mismo business_id del caller (policy profiles_admin_same_business).
  async listBusinessUsers(): Promise<Profile[]> {
    const { data, error } = await this.client
      .from('profiles')
      .select('*')
      .order('created_at', { ascending: false });
    if (error) throw error;
    return (data ?? []) as Profile[];
  }
}
