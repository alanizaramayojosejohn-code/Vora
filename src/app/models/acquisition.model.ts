export interface AcquisitionItem {
  id: string;
  acquisition_id: string;
  product_id: string;
  product: { id: string; name: string } | null;
  quantity: number;
  unit_cost: number;
}

export interface Acquisition {
  id: string;
  business_id: string;
  supplier_id: string | null;
  supplier: { id: string; name: string } | null;
  total_cost: number;
  notes: string | null;
  acquired_at: string;
  created_by: string | null;
  created_at: string;
  items: AcquisitionItem[];
}
