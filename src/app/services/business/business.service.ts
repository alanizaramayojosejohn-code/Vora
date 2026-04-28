import { inject, Injectable } from '@angular/core';
import { BusinessType } from '../../models/business.model';
import { SupabaseService } from '../supabase/supabase.service';

export interface CreateBusinessWithAdminInput {
  businessName: string;
  businessType: BusinessType;
  adminUserId: string;
  adminName: string;
  adminCi: string;
  services: string[];
}

@Injectable({ providedIn: 'root' })
export class BusinessService {
  private readonly client = inject(SupabaseService).client;

  // RPC create_business_with_admin: crea negocio + profile del admin + servicios
  // en una sola transacción. Devuelve el business_id creado.
  async createBusinessWithAdmin(input: CreateBusinessWithAdminInput): Promise<string> {
    const { data, error } = await this.client.rpc('create_business_with_admin', {
      p_business_name: input.businessName,
      p_business_type: input.businessType,
      p_admin_user_id: input.adminUserId,
      p_admin_name: input.adminName,
      p_admin_ci: input.adminCi,
      p_services: input.services,
    });
    if (error) throw error;
    return data as string;
  }
}
