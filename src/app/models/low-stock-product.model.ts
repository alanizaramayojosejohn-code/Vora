export interface LowStockProduct {
  id: string;
  business_id: string;
  name: string;
  stock: number;
  has_stock: boolean;
  category_name: string | null;
}
