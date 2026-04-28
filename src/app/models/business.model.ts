export type BusinessType = 'pos' | 'gym';

export interface Business {
  id: string;
  name: string;
  type: BusinessType;
  created_at: string;
}
