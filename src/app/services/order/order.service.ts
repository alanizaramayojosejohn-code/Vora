import { inject, Injectable } from '@angular/core';
import { OrderStatus, PaymentMethod } from '../../models/order.model';
import { PaymentLine } from '../../models/payment-split.model';
import { SupabaseService } from '../supabase/supabase.service';

export interface RegisterProductItem {
  product_id: string;
  quantity: number;
  unit_price: number;
}

export interface RegisterOrderInput {
  client_id: string | null;
  // Null cuando el pedido se deja pendiente: todavía no se cobró nada.
  payment_method: PaymentMethod | null;
  items: RegisterProductItem[];
  notes?: string | null;
  // Turno en que se cobró. Viaja dentro del input para que las ventas en cola
  // offline se imputen a su turno real y no al que esté abierto al sincronizar.
  cash_session_id?: string | null;
  table_id?: string | null;
  is_takeaway?: boolean;
  status?: OrderStatus;
  // Pago dividido. Si va vacío, el servidor arma una sola línea con
  // payment_method por el total.
  payments?: PaymentLine[] | null;
}

export interface OrderOperationResult {
  order_id: string;
  total_amount: number;
  already_applied: boolean;
}

// Cómo se nombra al pedido sobre el que se opera. Lo normal es el `uuid`
// (client_uuid), que existe aunque el pedido todavía no haya llegado al
// servidor; el `id` es la salida para pedidos viejos, anteriores a que el
// cliente generara uuid propio.
export interface OrderRef {
  uuid: string | null;
  id: string | null;
}

@Injectable({ providedIn: 'root' })
export class OrderService {
  private readonly client = inject(SupabaseService).client;

  // `clientUuid` hace la llamada idempotente: si el servidor ya registró esta
  // venta pero se perdió la respuesta, el reintento devuelve la misma orden en
  // vez de duplicarla. Siempre debe ser estable entre reintentos de UNA venta.
  //
  // Además es la identidad con la que las operaciones posteriores (agregar
  // ítems, saldar) referencian al pedido, incluso antes de que exista en el
  // servidor — por eso ahora se manda siempre, no solo desde la cola offline.
  async registerOrder(input: RegisterOrderInput, clientUuid: string): Promise<string> {
    const { data, error } = await this.client.rpc('register_order', {
      p_client_id: input.client_id,
      p_payment_method: input.payment_method,
      p_items: input.items,
      p_notes: input.notes ?? null,
      p_client_uuid: clientUuid,
      p_cash_session_id: input.cash_session_id ?? null,
      p_table_id: input.table_id ?? null,
      p_is_takeaway: input.is_takeaway ?? false,
      p_status: input.status ?? 'settled',
      p_payments: input.payments ?? null,
    });
    if (error) throw error;
    return data as string;
  }

  // `operationUuid` es la clave de idempotencia de ESTA operación (no del
  // pedido): la cola offline puede reintentarla sin agregar los ítems dos veces.
  async addItems(
    operationUuid: string,
    order: OrderRef,
    items: RegisterProductItem[],
  ): Promise<OrderOperationResult> {
    const { data, error } = await this.client.rpc('add_items_to_order', {
      p_operation_uuid: operationUuid,
      p_order_client_uuid: order.uuid,
      p_items: items,
      p_order_id: order.id,
    });
    if (error) throw error;
    return data as OrderOperationResult;
  }

  // `expectedTotal` es el bloqueo optimista: si el pedido creció en el servidor
  // desde que este dispositivo lo vio, el cobro se rechaza con VORA6 en vez de
  // registrar un pago por menos de lo consumido.
  async settleOrder(
    operationUuid: string,
    order: OrderRef,
    payments: PaymentLine[],
    expectedTotal: number,
    cashSessionId: string | null,
  ): Promise<OrderOperationResult> {
    const { data, error } = await this.client.rpc('settle_order', {
      p_operation_uuid: operationUuid,
      p_order_client_uuid: order.uuid,
      p_payments: payments,
      p_expected_total: expectedTotal,
      p_cash_session_id: cashSessionId,
      p_order_id: order.id,
    });
    if (error) throw error;
    return data as OrderOperationResult;
  }

  async cancelOrder(orderId: string, reason: string): Promise<void> {
    const { error } = await this.client.rpc('cancel_order', {
      p_order_id: orderId,
      p_cancel_reason: reason,
    });
    if (error) throw error;
  }
}
