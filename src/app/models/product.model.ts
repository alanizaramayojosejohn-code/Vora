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
  has_stock: boolean;
  provider: string | null;
  image_url: string | null;
  created_at: string;
  deleted_at: string | null;
}
