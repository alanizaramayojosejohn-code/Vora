export type UserRole = 'super_admin' | 'admin' | 'caja';

export interface Profile {
  id: string;
  business_id: string | null;
  name: string;
  ci: string;
  role: UserRole;
  created_at: string;
}
