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
  // Turno en que se cobró. Viaja dentro del input para que las ventas en cola
  // offline se imputen a su turno real y no al que esté abierto al sincronizar.
  cash_session_id?: string | null;
}

@Injectable({ providedIn: 'root' })
export class OrderService {
  private readonly client = inject(SupabaseService).client;

  // `clientUuid` hace la llamada idempotente: si el servidor ya registró esta
  // venta pero se perdió la respuesta, el reintento devuelve la misma orden en
  // vez de duplicarla. Siempre debe ser estable entre reintentos de UNA venta.
  async registerOrder(input: RegisterOrderInput, clientUuid?: string): Promise<string> {
    const { data, error } = await this.client.rpc('register_order', {
      p_client_id: input.client_id,
      p_payment_method: input.payment_method,
      p_items: input.items,
      p_notes: input.notes ?? null,
      p_client_uuid: clientUuid ?? null,
      p_cash_session_id: input.cash_session_id ?? null,
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
