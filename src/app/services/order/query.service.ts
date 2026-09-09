import { inject, Injectable } from '@angular/core';
import {
  OrderItemWithDetails,
  OrderPayment,
  OrderWithDetails,
} from '../../models/order.model';
import { SupabaseService } from '../supabase/supabase.service';

const ORDER_SELECT = `
  *,
  clients(ci, name),
  tables(name),
  order_items(*, products(name)),
  order_payments(id, order_id, method, amount, cash_session_id, created_at)
`;

@Injectable({ providedIn: 'root' })
export class OrderQueryService {
  private readonly client = inject(SupabaseService).client;

  // RLS filtra por business_id del caller.
  async listOrders(limit = 50): Promise<OrderWithDetails[]> {
    const { data, error } = await this.client
      .from('orders')
      .select(ORDER_SELECT)
      .order('created_at', { ascending: false })
      .limit(limit);
    if (error) throw error;
    return (data ?? []).map(mapOrder);
  }

  // Pendientes que el usuario puede tocar: un cajero ve los suyos, un admin los
  // de todo el negocio (RF-15, RF-16). Mostrarle a un cajero cuentas que no
  // puede cobrar solo le daría botones que fallan.
  async listPendingOrders(createdBy: string | null): Promise<OrderWithDetails[]> {
    let query = this.client
      .from('orders')
      .select(ORDER_SELECT)
      .eq('status', 'pending')
      .is('cancelled_at', null)
      .order('created_at', { ascending: true });

    if (createdBy) query = query.eq('created_by', createdBy);

    const { data, error } = await query;
    if (error) throw error;
    return (data ?? []).map(mapOrder);
  }
}

function mapOrder(row: any): OrderWithDetails {
  const { clients, tables, order_items, order_payments, ...order } = row;

  const items: OrderItemWithDetails[] = (order_items ?? []).map((item: any) => {
    const { products, ...rest } = item;
    return { ...rest, product_name: products?.name ?? null };
  });

  const payments: OrderPayment[] = (order_payments ?? [])
    .map((p: any) => ({ ...p, amount: Number(p.amount) }))
    .sort((a: OrderPayment, b: OrderPayment) => a.created_at.localeCompare(b.created_at));

  return {
    ...order,
    client_label: clients ? `${clients.ci} · ${clients.name}` : null,
    table_name: tables?.name ?? null,
    items,
    payments,
  } as OrderWithDetails;
}
