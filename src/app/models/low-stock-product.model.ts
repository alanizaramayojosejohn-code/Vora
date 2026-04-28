export interface LowStockProduct {
  id: string;
  business_id: string;
  name: string;
  category: string | null;
  stock: number;
  price: number;
  cost: number;
  provider: string | null;
}
