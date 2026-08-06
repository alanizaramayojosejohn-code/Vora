import { inject, Injectable } from '@angular/core';
import { DailyIncome } from '../../models/daily-income.model';
import { LowStockProduct } from '../../models/low-stock-product.model';
import { MonthlyIncome } from '../../models/monthly-income.model';
import { SupabaseService } from '../supabase/supabase.service';

@Injectable({ providedIn: 'root' })
export class ReportQueryService {
  private readonly client = inject(SupabaseService).client;

  // Todas las vistas usan security_invoker; RLS filtra por business_id del caller.

  async listDailyIncome(days = 30): Promise<DailyIncome[]> {
    const since = new Date();
    since.setDate(since.getDate() - days);
    const sinceStr = since.toISOString().slice(0, 10);

    const { data, error } = await this.client
      .from('income_daily')
      .select('*')
      .gte('day', sinceStr)
      .order('day', { ascending: false });
    if (error) throw error;
    return (data ?? []) as DailyIncome[];
  }

  async listMonthlyIncome(months = 12): Promise<MonthlyIncome[]> {
    const since = new Date();
    since.setMonth(since.getMonth() - months);
    since.setDate(1);
    const sinceStr = since.toISOString().slice(0, 10);

    const { data, error } = await this.client
      .from('monthly_income')
      .select('*')
      .gte('month', sinceStr)
      .order('month', { ascending: false });
    if (error) throw error;
    return (data ?? []) as MonthlyIncome[];
  }

  async listLowStockProducts(): Promise<LowStockProduct[]> {
    const { data, error } = await this.client
      .from('low_stock_products')
      .select('*')
      .order('stock', { ascending: true });
    if (error) throw error;
    return (data ?? []) as LowStockProduct[];
  }

  // Antes esto se bajaba orders → order_items → products → categories del mes
  // entero para sumarlo en el navegador: un negocio con volumen transfería
  // miles de filas para mostrar cinco. La vista revenue_by_category ya agrega
  // en la base y devuelve una fila por categoría.
  async listRevenueByCategoryThisMonth(): Promise<{ category: string; total: number }[]> {
    const now = new Date();
    // Primer día del mes en hora local. La vista agrupa en hora de Bolivia, así
    // que armar el filtro con toISOString() erraría el mes durante la tarde del
    // día 1 y del último día.
    const month = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-01`;

    const { data, error } = await this.client
      .from('revenue_by_category')
      .select('category_name, total')
      .eq('month', month)
      .order('total', { ascending: false });
    if (error) throw error;

    return (data ?? []).map((row: { category_name: string; total: number | string }) => ({
      category: row.category_name,
      total: Number(row.total),
    }));
  }
}
