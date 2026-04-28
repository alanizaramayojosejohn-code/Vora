import { inject, Injectable } from '@angular/core';
import { MembershipPlan, MembershipType } from '../../models/membership-plan.model';
import { AuthService } from '../auth/auth.service';
import { SupabaseService } from '../supabase/supabase.service';

export interface CreateMembershipPlanInput {
  name: string;
  duration_days: number;
  sessions_number: number | null;
  price: number;
  type: MembershipType;
  service_ids: string[];
}

@Injectable({ providedIn: 'root' })
export class MembershipPlanService {
  private readonly client = inject(SupabaseService).client;
  private readonly auth = inject(AuthService);

  async createPlan(input: CreateMembershipPlanInput): Promise<MembershipPlan> {
    const businessId = this.auth.businessId();
    if (!businessId) throw new Error('Tu cuenta no tiene un negocio asignado.');

    const { data: plan, error } = await this.client
      .from('membership_plans')
      .insert({
        business_id: businessId,
        name: input.name,
        duration_days: input.duration_days,
        sessions_number: input.sessions_number,
        price: input.price,
        type: input.type,
      })
      .select('*')
      .single();
    if (error) throw error;

    if (input.service_ids.length > 0) {
      const rows = input.service_ids.map((service_id) => ({
        plan_id: (plan as MembershipPlan).id,
        service_id,
      }));
      const { error: linkError } = await this.client
        .from('membership_plan_services')
        .insert(rows);
      if (linkError) throw linkError;
    }

    return plan as MembershipPlan;
  }
}
