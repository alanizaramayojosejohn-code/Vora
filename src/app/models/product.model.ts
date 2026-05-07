export interface Product {
  id: string;
  business_id: string;
  name: string;
  description: string | null;
  category_id: string | null;
  category: { id: string; name: string; description: string | null } | null;
  price: number;
  cost: number;
  stock: number;
  provider: string | null;
  created_at: string;
  deleted_at: string | null;
}
