import { inject, Injectable } from '@angular/core';
import { Category } from '../../models/category.model';
import { SupabaseService } from '../supabase/supabase.service';

@Injectable({ providedIn: 'root' })
export class CategoryQueryService {
  private readonly client = inject(SupabaseService).client;

  // RLS filtra por business_id. Ordenadas alfabéticamente para el select del formulario.
  async listCategories(): Promise<Category[]> {
    const { data, error } = await this.client
      .from('categories')
      .select('*')
      .order('name', { ascending: true });
    if (error) throw error;
    return (data ?? []) as Category[];
  }
}
