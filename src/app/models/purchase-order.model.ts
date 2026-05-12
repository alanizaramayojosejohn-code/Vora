export type PurchaseOrderStatus = 'pending' | 'received' | 'cancelled';

export interface PurchaseOrderItem {
  id: string;
  purchase_order_id: string;
  product_id: string;
  product: { id: string; name: string } | null;
  quantity_ordered: number;
  unit_cost_estimate: number | null;
}

export interface PurchaseOrder {
  id: string;
  business_id: string;
  supplier_id: string | null;
  supplier: { id: string; name: string } | null;
  expected_date: string | null;
  status: PurchaseOrderStatus;
  notes: string | null;
  created_at: string;
  items: PurchaseOrderItem[];
}
