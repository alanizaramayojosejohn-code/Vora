import { inject, Injectable } from '@angular/core';
import {
  DailySalesSummary,
  SalesByPaymentDay,
  summarizeDailySales,
  TopProduct,
} from '../../models/daily-sales.model';
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

  async topProducts(range: DayRange, limit = 5): Promise<TopProduct[]> {
    const { from, to } = DailySalesQueryService.rangeBounds(range);

    const { data, error } = await this.client.rpc('top_products', {
      p_from: from,
      p_to: to,
      p_limit: limit,
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
