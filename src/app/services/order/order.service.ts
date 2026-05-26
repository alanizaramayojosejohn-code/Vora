import { inject, Injectable } from '@angular/core';
import { SupabaseService } from '../supabase/supabase.service';

export interface RegisterProductItem {
  product_id: string;
  quantity: number;
  unit_price: number;
}

export interface RegisterOrderInput {
  client_id: string | null;
  payment_method: 'cash' | 'card' | 'qr';
  items: RegisterProductItem[];
  notes?: string | null;
}

@Injectable({ providedIn: 'root' })
export class OrderService {
  private readonly client = inject(SupabaseService).client;

  async registerOrder(input: RegisterOrderInput): Promise<string> {
    const { data, error } = await this.client.rpc('register_order', {
      p_client_id: input.client_id,
      p_payment_method: input.payment_method,
      p_items: input.items,
      p_notes: input.notes ?? null,
    });
    if (error) throw error;
    return data as string;
  }

  async cancelOrder(orderId: string, reason: string): Promise<void> {
    const { error } = await this.client.rpc('cancel_order', {
      p_order_id: orderId,
      p_cancel_reason: reason,
    });
    if (error) throw error;
  }
}
