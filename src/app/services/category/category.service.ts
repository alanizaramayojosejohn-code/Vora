import { inject, Injectable } from '@angular/core';
import { Category } from '../../models/category.model';
import { AuthService } from '../auth/auth.service';
import { SupabaseService } from '../supabase/supabase.service';

export interface CreateCategoryInput {
  name: string;
  description: string | null;
}

export type UpdateCategoryInput = CreateCategoryInput;

@Injectable({ providedIn: 'root' })
export class CategoryService {
  private readonly client = inject(SupabaseService).client;
  private readonly auth = inject(AuthService);

  async createCategory(input: CreateCategoryInput): Promise<Category> {
    const businessId = this.auth.businessId();
    if (!businessId) throw new Error('Tu cuenta no tiene un negocio asignado.');

    const { data, error } = await this.client
      .from('categories')
      .insert({
        business_id: businessId,
        name: input.name,
        description: input.description,
      })
      .select('*')
      .single();
    if (error) throw error;
    return data as Category;
  }

  async updateCategory(id: string, input: UpdateCategoryInput): Promise<Category> {
    const { data, error } = await this.client
      .from('categories')
      .update({ name: input.name, description: input.description })
      .eq('id', id)
      .select('*')
      .single();
    if (error) throw error;
    return data as Category;
  }

  // Hard delete. FK products.category_id tiene ON DELETE SET NULL,
  // así que los productos afectados quedan sin categoría automáticamente.
  async deleteCategory(id: string): Promise<void> {
    const { error } = await this.client
      .from('categories')
      .delete()
      .eq('id', id);
    if (error) throw error;
  }
}
