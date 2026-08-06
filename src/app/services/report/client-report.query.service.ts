import { inject, Injectable } from '@angular/core';
import { ClientCoverage, ClientSalesSummary } from '../../models/client-sales.model';
import { SupabaseService } from '../supabase/supabase.service';

@Injectable({ providedIn: 'root' })
export class ClientReportQueryService {
  private readonly client = inject(SupabaseService).client;

  // Una fila por cliente, ya agregada en la base. El payload crece con la
  // cartera de clientes, no con el historial de ventas, así que un negocio con
  // años de operación sigue bajando lo mismo.
  //
  // El límite existe para que un negocio con miles de clientes no se traiga
  // todo: se ordena por gasto y se corta, que es justo lo que el reporte
  // necesita para el top. Los inactivos se filtran sobre ese mismo conjunto.
  async listSummary(limit = 500): Promise<ClientSalesSummary[]> {
    const { data, error } = await this.client
      .from('client_sales_summary')
      .select('*')
      .order('total_spent', { ascending: false })
      .limit(limit);
    if (error) throw error;

    return (data ?? []).map((row: ClientSalesSummary) => ({
      ...row,
      // numeric de Postgres llega como string en algunos casos; normalizar acá
      // evita que cada componente tenga que acordarse de hacer Number().
      total_spent: Number(row.total_spent),
      avg_ticket: Number(row.avg_ticket),
      orders_count: Number(row.orders_count),
    }));
  }

  // Proporción de ventas con cliente identificado. Se resuelve con dos
  // conteos `head: true`: no baja ni una fila, solo el número.
  async coverage(sinceDays = 30): Promise<ClientCoverage> {
    const since = new Date();
    since.setDate(since.getDate() - sinceDays);
    const sinceIso = since.toISOString();

    const [totalRes, identifiedRes] = await Promise.all([
      this.client
        .from('orders')
        .select('*', { count: 'exact', head: true })
        .is('cancelled_at', null)
        .gte('created_at', sinceIso),
      this.client
        .from('orders')
        .select('*', { count: 'exact', head: true })
        .is('cancelled_at', null)
        .not('client_id', 'is', null)
        .gte('created_at', sinceIso),
    ]);

    if (totalRes.error) throw totalRes.error;
    if (identifiedRes.error) throw identifiedRes.error;

    const total = totalRes.count ?? 0;
    const identified = identifiedRes.count ?? 0;
    return {
      total,
      identified,
      percentage: total === 0 ? 0 : (identified / total) * 100,
    };
  }
}
