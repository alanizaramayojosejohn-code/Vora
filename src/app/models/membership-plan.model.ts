export type MembershipType = 'normal' | 'promo';

export interface MembershipPlan {
  id: string;
  business_id: string;
  name: string;
  duration_days: number;
  sessions_number: number | null;
  price: number;
  type: MembershipType;
  created_at: string;
}

// Plan + nombres de los servicios incluidos (denormalizado para listar).
export interface MembershipPlanWithServices extends MembershipPlan {
  service_names: string[];
}
