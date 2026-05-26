export interface Sale {
  id: string;
  business_id: string;
  amount: number;
  quantity: number;
  client_id: string | null;
  product_id: string | null;
  created_by: string | null;
  created_at: string;
  cancelled_at: string | null;
  cancelled_by: string | null;
}

export interface SaleWithDetails extends Sale {
  product_name: string | null;
  client_label: string | null;
}
