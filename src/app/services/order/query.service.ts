import { inject, Injectable } from '@angular/core';
import {
  OrderItemWithDetails,
  OrderPayment,
  OrderStatus,
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

  // Para filtros por rango de fecha (día/semana/mes): acotar por fecha en vez
  // de por cantidad. `listOrders(100)` truncaba "30 días" a lo que entrara en
  // los últimos 100 pedidos sin mirar la fecha — en un negocio con más de 100
  // ventas en el mes, el filtro de 30 días mentía mostrando menos días de los
  // que decía. `limit` es un techo de seguridad, no el criterio de selección;
  // 2000 replica el mismo techo que ya usa SalesReportQueryService.listOrders
  // para su ventana de fechas.
  async listOrdersSince(fromIso: string, opts: { status?: OrderStatus; limit?: number } = {}): Promise<OrderWithDetails[]> {
    let query = this.client
      .from('orders')
      .select(ORDER_SELECT)
      .gte('created_at', fromIso)
      .order('created_at', { ascending: false })
      .limit(opts.limit ?? 2000);

    if (opts.status) query = query.eq('status', opts.status);

    const { data, error } = await query;
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
