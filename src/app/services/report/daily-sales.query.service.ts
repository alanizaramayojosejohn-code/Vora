import { inject, Injectable } from '@angular/core';
import {
  DailySalesSummary,
  SalesByPaymentDay,
  summarizeDailySales,
  TopProduct,
  TopProductOrderBy,
} from '../../models/daily-sales.model';
import { EMPTY_PROFIT_TOTALS, ProfitTotals } from '../../models/profit.model';
import { SupabaseService } from '../supabase/supabase.service';

// Rangos ofrecidos al plan Caja. Son presets y no un selector libre de fechas
// a propósito: el reporte con rango arbitrario es del plan Negocio, y además
// acotar el rango mantiene la consulta barata.
export type DayRange = 'today' | 'week' | 'month';

export const DAY_RANGE_LABELS: Record<DayRange, string> = {
  today: 'Hoy',
  week: 'Últimos 7 días',
  month: 'Últimos 30 días',
};

export interface OpenSessionSales {
  session_id: string;
  cashier_name: string | null;
  opened_at: string;
  opening_float: number;
  sales_count: number;
  cash_sales: number;
  card_sales: number;
  qr_sales: number;
  total_sales: number;
}

@Injectable({ providedIn: 'root' })
export class DailySalesQueryService {
  private readonly client = inject(SupabaseService).client;

  // Fechas en hora LOCAL, no UTC. `toISOString()` convierte a UTC y en Bolivia
  // (UTC-4) eso adelanta un día durante toda la tarde: a las 20:00 del lunes
  // ya devolvería el martes, y "Hoy" mostraría un día equivocado.
  static localDate(d: Date): string {
    const y = d.getFullYear();
    const m = String(d.getMonth() + 1).padStart(2, '0');
    const day = String(d.getDate()).padStart(2, '0');
    return `${y}-${m}-${day}`;
  }

  static rangeBounds(range: DayRange, today: Date = new Date()): { from: string; to: string } {
    const to = DailySalesQueryService.localDate(today);
    if (range === 'today') return { from: to, to };

    const from = new Date(today);
    from.setDate(from.getDate() - (range === 'week' ? 6 : 29));
    return { from: DailySalesQueryService.localDate(from), to };
  }

  // Filas por día y método de pago. La vista ya agrupa en la base: acá vuelven
  // como mucho 3 filas por día, no una por venta.
  async listByPayment(range: DayRange): Promise<SalesByPaymentDay[]> {
    const { from, to } = DailySalesQueryService.rangeBounds(range);

    const { data, error } = await this.client
      .from('sales_by_payment_daily')
      .select('*')
      .gte('day', from)
      .lte('day', to)
      .order('day', { ascending: false });
    if (error) throw error;
    return (data ?? []) as SalesByPaymentDay[];
  }

  async summary(range: DayRange): Promise<DailySalesSummary> {
    return summarizeDailySales(await this.listByPayment(range));
  }

  // Costo y ganancia bruta del rango (spec 002, RF-11), sumados desde
  // income_daily — la misma vista que ya trae el ingreso día por día, así que
  // "Total vendido" de esta pantalla y la suma de esto SIEMPRE coinciden: no
  // hay una segunda fuente de verdad para el ingreso.
  async profitSummary(range: DayRange): Promise<ProfitTotals> {
    const { from, to } = DailySalesQueryService.rangeBounds(range);

    const { data, error } = await this.client
      .from('income_daily')
      .select('total, cost, profit')
      .gte('day', from)
      .lte('day', to);
    if (error) throw error;

    return (data ?? []).reduce(
      (acc, row: { total: number; cost: number; profit: number }) => ({
        revenue: acc.revenue + Number(row.total),
        cost: acc.cost + Number(row.cost),
        profit: acc.profit + Number(row.profit),
      }),
      { ...EMPTY_PROFIT_TOTALS },
    );
  }

  // Cuántos productos vendidos en el rango no tienen costo cargado (RF-23).
  async zeroCostProductCount(range: DayRange): Promise<number> {
    const { from, to } = DailySalesQueryService.rangeBounds(range);
    const { data, error } = await this.client.rpc('zero_cost_product_count', {
      p_from: from,
      p_to: to,
    });
    if (error) throw error;
    return Number(data ?? 0);
  }

  async topProducts(range: DayRange, limit = 5, orderBy: TopProductOrderBy = 'quantity'): Promise<TopProduct[]> {
    const { from, to } = DailySalesQueryService.rangeBounds(range);

    const { data, error } = await this.client.rpc('top_products', {
      p_from: from,
      p_to: to,
      p_limit: limit,
      p_order_by: orderBy,
    });
    if (error) throw error;
    return (data ?? []) as TopProduct[];
  }

  // Turnos abiertos ahora mismo. Solo admins: la RPC lo verifica del lado del
  // servidor porque el efectivo del turno en curso no debe llegarle al cajero.
  async openSessions(): Promise<OpenSessionSales[]> {
    const { data, error } = await this.client.rpc('open_sessions_sales');
    if (error) throw error;
    return (data ?? []) as OpenSessionSales[];
  }
}
