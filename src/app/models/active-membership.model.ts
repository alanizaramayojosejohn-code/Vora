import type { MembershipType } from './membership-plan.model';

export interface ActiveMembership {
  client_membership_id: string;
  business_id: string;
  client_id: string;
  client_ci: string;
  client_name: string;
  client_phone: string | null;
  plan_id: string;
  plan_name: string;
  plan_type: MembershipType;
  start_date: string;
  end_date: string;
  sessions_left: number | null;
  days_left: number;
}
