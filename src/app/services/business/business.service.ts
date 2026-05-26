import { inject, Injectable } from '@angular/core';
import { SupabaseService } from '../supabase/supabase.service';
import { BusinessTheme } from '../theme/theme.presets';

export interface CreateBusinessWithAdminInput {
  businessName: string;
  adminUserId: string;
  adminName: string;
  adminCi: string;
  theme?: BusinessTheme;
}

export interface UpdateBusinessInput {
  name: string;
  theme?: BusinessTheme;
  logo_url?: string | null;
}

@Injectable({ providedIn: 'root' })
export class BusinessService {
  private readonly client = inject(SupabaseService).client;

  // RPC create_business_with_admin: crea negocio + profile del admin + servicios
  // en una sola transacción. Devuelve el business_id creado.
  // Si se pasa theme, se aplica con un update inmediato (la RPC actual no lo
  // recibe — evita migrar la firma del RPC). El default 'monochrome system'
  // queda si no se pasa nada.
  async createBusinessWithAdmin(input: CreateBusinessWithAdminInput): Promise<string> {
    const { data, error } = await this.client.rpc('create_business_with_admin', {
      p_business_name: input.businessName,
      p_admin_user_id: input.adminUserId,
      p_admin_name: input.adminName,
      p_admin_ci: input.adminCi,
    });
    if (error) throw error;
    const businessId = data as string;

    if (input.theme) {
      await this.updateTheme(businessId, input.theme);
    }
    return businessId;
  }

  async updateBusiness(id: string, input: UpdateBusinessInput): Promise<void> {
    const update: Record<string, unknown> = { name: input.name };
    if (input.theme) update['theme'] = input.theme;
    if ('logo_url' in input) update['logo_url'] = input.logo_url;

    const { error } = await this.client
      .from('businesses')
      .update(update)
      .eq('id', id);
    if (error) throw error;
  }

  // Sube el archivo al bucket y devuelve la URL pública con cache-buster.
  // Usa el businessId como carpeta para que cada negocio tenga su propio espacio.
  async uploadLogo(file: File, businessId: string): Promise<string> {
    const ext = file.name.split('.').pop()?.toLowerCase() ?? 'jpg';
    const path = `${businessId}/logo.${ext}`;
    const { error } = await this.client.storage
      .from('business-logos')
      .upload(path, file, { upsert: true, contentType: file.type });
    if (error) throw error;
    const { data } = this.client.storage.from('business-logos').getPublicUrl(path);
    return `${data.publicUrl}?t=${Date.now()}`;
  }

  async removeLogo(businessId: string): Promise<void> {
    // Intentamos borrar las extensiones mas comunes; ignoramos errores de "not found".
    const paths = ['jpg', 'jpeg', 'png', 'webp', 'svg'].map((e) => `${businessId}/logo.${e}`);
    await this.client.storage.from('business-logos').remove(paths);
  }

  // Actualizacion aislada del tema. La usamos tanto post-creacion (cuando
  // el super_admin pico paleta en el form de alta) como desde el toggle
  // de apariencia mas adelante. RLS ya restringe businesses al super_admin.
  async updateTheme(id: string, theme: BusinessTheme): Promise<void> {
    const { error } = await this.client
      .from('businesses')
      .update({ theme })
      .eq('id', id);
    if (error) throw error;
  }

  // Hard delete con cascade: borra TODO lo asociado al business
  // (profiles, clients, products, orders...).
  // El UI debe pedir confirmación explícita antes de invocarlo.
  async deleteBusiness(id: string): Promise<void> {
    const { error } = await this.client
      .from('businesses')
      .delete()
      .eq('id', id);
    if (error) throw error;
  }
}
