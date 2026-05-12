import { inject, Injectable } from '@angular/core';
import { Product } from '../../models/product.model';
import { AuthService } from '../auth/auth.service';
import { SupabaseService } from '../supabase/supabase.service';

export interface CreateProductInput {
  name: string;
  description: string | null;
  category_id: string | null;
  price: number;
  cost: number;
  stock: number;
  has_stock: boolean;
  provider: string | null;
}

export type UpdateProductInput = CreateProductInput;

@Injectable({ providedIn: 'root' })
export class ProductService {
  private readonly client = inject(SupabaseService).client;
  private readonly auth = inject(AuthService);

  async createProduct(input: CreateProductInput): Promise<Product> {
    const businessId = this.auth.businessId();
    if (!businessId) throw new Error('Tu cuenta no tiene un negocio asignado.');

    const { data, error } = await this.client
      .from('products')
      .insert({
        business_id: businessId,
        name: input.name,
        description: input.description,
        category_id: input.category_id,
        price: input.price,
        cost: input.cost,
        stock: input.has_stock ? input.stock : 0,
        has_stock: input.has_stock,
        provider: input.provider,
      })
      .select('*, category:categories(id, name, description)')
      .single();
    if (error) throw error;
    return data as Product;
  }

  async updateProduct(id: string, input: UpdateProductInput): Promise<Product> {
    const { data, error } = await this.client
      .from('products')
      .update({
        name: input.name,
        description: input.description,
        category_id: input.category_id,
        price: input.price,
        cost: input.cost,
        stock: input.has_stock ? input.stock : 0,
        has_stock: input.has_stock,
        provider: input.provider,
      })
      .eq('id', id)
      .select('*, category:categories(id, name, description)')
      .single();
    if (error) throw error;
    return data as Product;
  }

  // Soft delete: marca deleted_at. Las ventas históricas mantienen su producto;
  // los listados filtran por deleted_at is null para esconderlo.
  async softDeleteProduct(id: string): Promise<void> {
    const { error } = await this.client
      .from('products')
      .update({ deleted_at: new Date().toISOString() })
      .eq('id', id);
    if (error) throw error;
  }
}
