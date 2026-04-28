import { inject, Injectable } from '@angular/core';
import { UserRole } from '../../models/profile.model';
import { AuthService } from '../auth/auth.service';
import { SupabaseService } from '../supabase/supabase.service';

export interface CreateUserForBusinessInput {
  user_id: string;
  name: string;
  ci: string;
  role: Extract<UserRole, 'admin' | 'caja'>;
}

export interface UpdateProfileInput {
  name: string;
  ci: string;
  role: Extract<UserRole, 'admin' | 'caja'>;
}

@Injectable({ providedIn: 'root' })
export class ProfileService {
  private readonly client = inject(SupabaseService).client;
  private readonly auth = inject(AuthService);

  // RPC create_user_for_business: crea profile para un auth.user existente.
  // El admin caller solo puede crear users en su propio negocio.
  async createUserForBusiness(input: CreateUserForBusinessInput): Promise<string> {
    const businessId = this.auth.businessId();
    if (!businessId) throw new Error('Tu cuenta no tiene un negocio asignado.');

    const { data, error } = await this.client.rpc('create_user_for_business', {
      p_user_id: input.user_id,
      p_business_id: businessId,
      p_name: input.name,
      p_ci: input.ci,
      p_role: input.role,
    });
    if (error) throw error;
    return data as string;
  }

  // Update solo de campos editables (name, ci, role). business_id e id no se tocan.
  // RLS profiles_admin_same_business cubre el chequeo de tenant.
  async updateProfile(id: string, input: UpdateProfileInput): Promise<void> {
    const { error } = await this.client
      .from('profiles')
      .update({ name: input.name, ci: input.ci, role: input.role })
      .eq('id', id);
    if (error) throw error;
  }

  // Borra el profile. El auth.user queda intacto pero sin profile asignado:
  // AuthService.loadProfile lo cierra en el próximo login (patrón invite-only).
  async deleteProfile(id: string): Promise<void> {
    const { error } = await this.client
      .from('profiles')
      .delete()
      .eq('id', id);
    if (error) throw error;
  }
}
