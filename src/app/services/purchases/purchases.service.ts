import { inject, Injectable } from '@angular/core';
import { Acquisition } from '../../models/acquisition.model';
import { PurchaseOrder } from '../../models/purchase-order.model';
import { SupabaseService } from '../supabase/supabase.service';

export interface AcquisitionItemInput {
  product_id: string;
  quantity: number;
  unit_cost: number;
}

export interface RegisterAcquisitionInput {
  supplier_id: string | null;
  notes: string | null;
  acquired_at: string;
  items: AcquisitionItemInput[];
}

export interface PurchaseOrderItemInput {
  product_id: string;
  quantity_ordered: number;
  unit_cost_estimate: number | null;
}

export interface CreatePurchaseOrderInput {
  supplier_id: string | null;
  expected_date: string | null;
  notes: string | null;
  items: PurchaseOrderItemInput[];
}

const ACQUISITION_SELECT = `
  *,
  supplier:suppliers(id, name),
  items:acquisition_items(*, product:products(id, name))
`;

const PURCHASE_ORDER_SELECT = `
  *,
  supplier:suppliers(id, name),
  items:purchase_order_items(*, product:products(id, name))
`;

@Injectable({ providedIn: 'root' })
export class PurchasesService {
  private readonly client = inject(SupabaseService).client;

  async registerAcquisition(input: RegisterAcquisitionInput): Promise<string> {
    const { data, error } = await this.client.rpc('register_acquisition', {
      p_supplier_id: input.supplier_id,
      p_notes: input.notes,
      p_acquired_at: input.acquired_at,
      p_items: input.items,
    });
    if (error) throw error;
    return data as string;
  }

  async createPurchaseOrder(input: CreatePurchaseOrderInput): Promise<string> {
    const { data, error } = await this.client.rpc('create_purchase_order', {
      p_supplier_id: input.supplier_id,
      p_expected_date: input.expected_date,
      p_notes: input.notes,
      p_items: input.items,
    });
    if (error) throw error;
    return data as string;
  }

  async receivePurchaseOrder(orderId: string): Promise<string> {
    const { data, error } = await this.client.rpc('receive_purchase_order', {
      p_order_id: orderId,
    });
    if (error) throw error;
    return data as string;
  }

  async cancelPurchaseOrder(orderId: string): Promise<void> {
    const { error } = await this.client.rpc('cancel_purchase_order', {
      p_order_id: orderId,
    });
    if (error) throw error;
  }

  async listAcquisitions(limit = 20): Promise<Acquisition[]> {
    const { data, error } = await this.client
      .from('acquisitions')
      .select(ACQUISITION_SELECT)
      .order('acquired_at', { ascending: false })
      .order('created_at', { ascending: false })
      .limit(limit);
    if (error) throw error;
    return (data ?? []) as unknown as Acquisition[];
  }

  async listPurchaseOrders(status?: string): Promise<PurchaseOrder[]> {
    let query = this.client
      .from('purchase_orders')
      .select(PURCHASE_ORDER_SELECT)
      .order('created_at', { ascending: false });
    if (status) query = query.eq('status', status);
    const { data, error } = await query;
    if (error) throw error;
    return (data ?? []) as unknown as PurchaseOrder[];
  }
}
