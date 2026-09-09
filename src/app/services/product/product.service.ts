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

const IMAGE_BUCKET = 'product-images';

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

    // La imagen sí se borra de verdad: el reporte histórico muestra nombre y
    // precio, no la foto, así que no hay nada que preservar. Best-effort — un
    // fallo del storage no puede dejar el producto a medio eliminar.
    try {
      await this.removeImage(id);
    } catch (err: unknown) {
      console.error('No se pudo borrar la imagen del producto eliminado', err);
    }
  }

  // ── Imágenes ──────────────────────────────────────────────────────────────
  //
  // Ruta: {business_id}/{product_id}.webp. El business_id como primer segmento
  // es lo que la policy del bucket compara contra current_user_business_id(),
  // así que un negocio no puede escribir en la carpeta de otro. El nombre del
  // archivo del usuario nunca se usa.
  //
  // El archivo tiene que venir de compressProductImage(): es lo que garantiza
  // que sea WebP re-codificado y no el archivo original.

  private imagePath(productId: string): string {
    const businessId = this.auth.businessId();
    if (!businessId) throw new Error('Tu cuenta no tiene un negocio asignado.');
    return `${businessId}/${productId}.webp`;
  }

  async uploadImage(file: File, productId: string): Promise<string> {
    const path = this.imagePath(productId);
    const { error } = await this.client.storage
      .from(IMAGE_BUCKET)
      .upload(path, file, { upsert: true, contentType: 'image/webp' });
    if (error) throw error;

    const { data } = this.client.storage.from(IMAGE_BUCKET).getPublicUrl(path);
    // El cache-buster se calcula al subir y se guarda en la fila, no al leer:
    // la URL queda estable hasta el próximo reemplazo. Si se recalculara en
    // cada render, cada carga del POS sería un miss de caché y las imágenes
    // se bajarían de nuevo — que es justo lo que el egress no aguanta.
    return `${data.publicUrl}?v=${Date.now()}`;
  }

  async removeImage(productId: string): Promise<void> {
    const { error } = await this.client.storage
      .from(IMAGE_BUCKET)
      .remove([this.imagePath(productId)]);
    if (error) throw error;
  }

  async setImageUrl(productId: string, imageUrl: string | null): Promise<void> {
    const { error } = await this.client
      .from('products')
      .update({ image_url: imageUrl })
      .eq('id', productId);
    if (error) throw error;
  }
}
