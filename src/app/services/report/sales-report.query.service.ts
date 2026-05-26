import { inject, Injectable } from '@angular/core';
import { PaymentMethod } from '../../models/order.model';
import { Profile } from '../../models/profile.model';
import { SalesReportRow, SalesSummary } from '../export/export.service';
import { SupabaseService } from '../supabase/supabase.service';

export interface SalesReportFilters {
  dateFrom: string;  // 'YYYY-MM-DD' o ''
  dateTo: string;    // 'YYYY-MM-DD' o ''
  userId: string;    // profile.id o ''
  productId: string; // product.id o ''
  paymentMethods: PaymentMethod[];  // [] = todos
}

export interface ProductOption {
  id: string;
  name: string;
}

@Injectable({ providedIn: 'root' })
export class SalesReportQueryService {
  private readonly client = inject(SupabaseService).client;

  async listOrders(filters: SalesReportFilters): Promise<SalesReportRow[]> {
    // orders.created_by → auth.users (no FK directo a profiles), así que
    // no podemos hacer profiles(name) desde orders. Resolvemos los nombres
    // en un paso separado y mapeamos por id.
    let query = this.client
      .from('orders')
      .select(`
        id, created_at, payment_method, total_amount, created_by,
        order_items(quantity, unit_price, product_id, products(id, name))
      `)
      .is('cancelled_at', null)
      .order('created_at', { ascending: false })
      .limit(2000);

    if (filters.dateFrom) {
      query = query.gte('created_at', filters.dateFrom + 'T00:00:00');
    }
    if (filters.dateTo) {
      query = query.lte('created_at', filters.dateTo + 'T23:59:59');
    }
    if (filters.userId) {
      query = query.eq('created_by', filters.userId);
    }
    if (filters.paymentMethods.length > 0) {
      query = query.in('payment_method', filters.paymentMethods);
    }

    const { data, error } = await query;
    if (error) throw error;

    // Mapa id → nombre de usuario para resolver en JS
    const userMap = await this.buildUserMap();

    let rows: SalesReportRow[] = (data ?? []).map((row: any) => {
      const items: any[] = row.order_items ?? [];
      const productNames = items
        .map((it: any) => it.products?.name ?? null)
        .filter(Boolean) as string[];

      const summary =
        productNames.length === 0
          ? '—'
          : productNames.length <= 2
            ? productNames.join(', ')
            : `${productNames[0]}, ${productNames[1]} (+${productNames.length - 2} más)`;

      return {
        id: row.id,
        created_at: row.created_at,
        user_name: userMap.get(row.created_by) ?? null,
        products_summary: summary,
        payment_method: row.payment_method as PaymentMethod,
        total_amount: Number(row.total_amount),
        item_count: items.reduce((acc: number, it: any) => acc + Number(it.quantity), 0),
        _productIds: items.map((it: any) => it.product_id as string | null),
      } as SalesReportRow & { _productIds: (string | null)[] };
    });

    // Filtro de producto aplicado en JS (join anidado)
    if (filters.productId) {
      rows = rows.filter((r) =>
        (r as any)._productIds?.includes(filters.productId),
      );
    }

    // Limpia el campo interno antes de retornar
    rows.forEach((r) => delete (r as any)._productIds);

    return rows;
  }

  // Devuelve un mapa profile.id → name para todos los usuarios del negocio.
  private async buildUserMap(): Promise<Map<string, string>> {
    const { data } = await this.client
      .from('profiles')
      .select('id, name')
      .in('role', ['admin', 'caja']);
    const map = new Map<string, string>();
    for (const p of (data ?? []) as { id: string; name: string }[]) {
      map.set(p.id, p.name);
    }
    return map;
  }

  buildSummary(rows: SalesReportRow[]): SalesSummary {
    const total = rows.reduce((s, r) => s + r.total_amount, 0);
    const transactions = rows.length;
    const avgTicket = transactions > 0 ? total / transactions : 0;
    const byMethod: Record<PaymentMethod, number> = { cash: 0, card: 0, qr: 0 };
    for (const r of rows) byMethod[r.payment_method] += r.total_amount;
    return { total, transactions, avgTicket, byMethod };
  }

  async listUsersForFilter(): Promise<Pick<Profile, 'id' | 'name' | 'role'>[]> {
    const { data, error } = await this.client
      .from('profiles')
      .select('id, name, role')
      .in('role', ['admin', 'caja'])
      .order('name');
    if (error) throw error;
    return (data ?? []) as Pick<Profile, 'id' | 'name' | 'role'>[];
  }

  async listProductsForFilter(): Promise<ProductOption[]> {
    // La tabla products usa deleted_at para soft-delete, no columna 'active'
    const { data, error } = await this.client
      .from('products')
      .select('id, name')
      .is('deleted_at', null)
      .order('name');
    if (error) throw error;
    return (data ?? []) as ProductOption[];
  }
}
