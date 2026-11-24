import { inject, Injectable } from '@angular/core';
import { OrderStatus, PaymentMethod } from '../../models/order.model';
import { Profile } from '../../models/profile.model';
import { SalesReportPaymentLine, SalesReportRow, SalesSummary } from '../export/export.service';
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

// Forma cruda de una fila del select de listOrders() de abajo — reflejo
// exacto de esas columnas, no de Order completo. `amount`/`unit_cost` etc.
// vienen como `numeric` de Postgres, que PostgREST puede serializar como
// string; por eso se admiten los dos y se normalizan con Number() al mapear.
interface SalesOrderRow {
  id: string;
  created_at: string;
  payment_method: PaymentMethod | null;
  total_amount: number | string;
  created_by: string | null;
  status: OrderStatus;
  order_items: {
    quantity: number | string;
    unit_price: number | string;
    unit_cost: number | string;
    product_id: string | null;
    products: { id: string; name: string } | null;
  }[];
  order_payments: { method: PaymentMethod; amount: number | string }[];
}

// _productIds viaja junto a la fila solo para el filtro por producto de más
// abajo (join anidado que PostgREST no puede filtrar del lado del server);
// se descarta antes de retornar, nunca sale de este archivo.
type SalesReportRowInternal = SalesReportRow & { _productIds: (string | null)[] };

@Injectable({ providedIn: 'root' })
export class SalesReportQueryService {
  private readonly client = inject(SupabaseService).client;

  async listOrders(filters: SalesReportFilters): Promise<SalesReportRow[]> {
    // orders.created_by → auth.users (no FK directo a profiles), así que
    // no podemos hacer profiles(name) desde orders. Resolvemos los nombres
    // en un paso separado y mapeamos por id.
    // Los pendientes se listan también, para no perderlos de vista, pero
    // buildSummary() los excluye de los totales: no son una venta realizada
    // todavía y sumarlos ahí contradiría al arqueo y a los reportes de
    // ingresos (spec 001 RF-20, spec 002 RF-8).
    let query = this.client
      .from('orders')
      .select(`
        id, created_at, payment_method, total_amount, created_by, status,
        order_items(quantity, unit_price, unit_cost, product_id, products(id, name)),
        order_payments(method, amount)
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

    const { data, error } = await query;
    if (error) throw error;

    // Mapa id → nombre de usuario para resolver en JS
    const userMap = await this.buildUserMap();

    // Supabase infiere el tipo de esta consulta a partir de la lista de
    // columnas del select (a diferencia de otros métodos del proyecto que
    // seleccionan con `*` y por eso el cliente no puede tipar el join tan
    // fino): products(id, name) queda inferido como array por la forma en
    // que Postgrest describe la relación, pero en runtime la fila SIEMPRE
    // trae un solo producto por línea (product_id es una FK simple) — por
    // eso el cast pasa por `unknown`, como pide TS cuando el tipo inferido
    // no coincide estructuralmente con la forma real de los datos.
    let rows: SalesReportRowInternal[] = ((data ?? []) as unknown as SalesOrderRow[]).map((row) => {
      const items = row.order_items ?? [];
      const productNames = items
        .map((it) => it.products?.name ?? null)
        .filter(Boolean) as string[];

      const summary =
        productNames.length === 0
          ? '—'
          : productNames.length <= 2
            ? productNames.join(', ')
            : `${productNames[0]}, ${productNames[1]} (+${productNames.length - 2} más)`;

      const payments: SalesReportPaymentLine[] = (row.order_payments ?? []).map((p) => ({
        method: p.method,
        amount: Number(p.amount),
      }));

      // Costo y ganancia se suman desde las líneas, cada una con su costo ya
      // congelado al vender (spec 002, RF-1): no dependen de qué diga hoy
      // products.cost.
      const cost = items.reduce((acc, it) => acc + Number(it.unit_cost) * Number(it.quantity), 0);
      const total = Number(row.total_amount);

      return {
        id: row.id,
        created_at: row.created_at,
        user_name: userMap.get(row.created_by ?? '') ?? null,
        products_summary: summary,
        payments,
        payment_methods: [...new Set(payments.map((p) => p.method))],
        total_amount: total,
        cost,
        profit: total - cost,
        item_count: items.reduce((acc, it) => acc + Number(it.quantity), 0),
        status: row.status,
        _productIds: items.map((it) => it.product_id),
      };
    });

    // Filtro de producto aplicado en JS (join anidado)
    if (filters.productId) {
      rows = rows.filter((r) => r._productIds.includes(filters.productId));
    }

    // El filtro por método también se aplica acá: con pago dividido la
    // condición ya no es una columna de la venta sino "tiene alguna línea con
    // ese método", y eso PostgREST no lo filtra sin cambiar la forma de la
    // consulta. Una venta mitad efectivo, mitad QR aparece en los dos filtros.
    if (filters.paymentMethods.length > 0) {
      const wanted = new Set(filters.paymentMethods);
      rows = rows.filter((r) => r.payment_methods.some((m) => wanted.has(m)));
    }

    // _productIds era solo para el filtro de arriba, nunca sale de acá.
    return rows.map(({ _productIds, ...r }) => r);
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

  // Solo lo cobrado entra a los totales: un pendiente aparece en `rows` para
  // que no se pierda de vista (ver comentario de listOrders), pero acá se
  // descarta — sumarlo inflaría ingreso, costo y ganancia con dinero que
  // todavía no se cobró.
  buildSummary(rows: SalesReportRow[]): SalesSummary {
    const settled = rows.filter((r) => r.status === 'settled');
    const total = settled.reduce((s, r) => s + r.total_amount, 0);
    const cost = settled.reduce((s, r) => s + r.cost, 0);
    const transactions = settled.length;
    const avgTicket = transactions > 0 ? total / transactions : 0;
    // Por método se suma línea a línea: de una venta dividida, cada método se
    // lleva lo suyo. Sumar el total completo en ambos duplicaría el ingreso.
    const byMethod: Record<PaymentMethod, number> = { cash: 0, card: 0, qr: 0 };
    for (const r of settled) {
      for (const p of r.payments) byMethod[p.method] += p.amount;
    }
    return { total, cost, profit: total - cost, transactions, avgTicket, byMethod };
  }

  // Productos sin costo cargado en el rango filtrado (RF-22/23). Sin fechas
  // elegidas se pide desde el origen del negocio hasta hoy: no hay un "desde"
  // más temprano posible en Postgres para acotar de otra forma.
  async zeroCostProductCount(filters: Pick<SalesReportFilters, 'dateFrom' | 'dateTo'>): Promise<number> {
    const { data, error } = await this.client.rpc('zero_cost_product_count', {
      p_from: filters.dateFrom || '1970-01-01',
      p_to: filters.dateTo || new Date().toISOString().slice(0, 10),
    });
    if (error) throw error;
    return Number(data ?? 0);
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
