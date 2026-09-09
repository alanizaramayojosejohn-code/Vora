import { inject, Injectable } from '@angular/core';
import { DailyIncome } from '../../models/daily-income.model';
import { LowStockProduct } from '../../models/low-stock-product.model';
import { MonthlyIncome } from '../../models/monthly-income.model';
import { SupabaseService } from '../supabase/supabase.service';

export interface CategoryRevenue {
  category: string;
  total: number;
  // Costo y ganancia bruta de la categoría en el mes (spec 002, RF-18).
  cost: number;
  profit: number;
}

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
  async listRevenueByCategoryThisMonth(): Promise<CategoryRevenue[]> {
    const now = new Date();
    // Primer día del mes en hora local. La vista agrupa en hora de Bolivia, así
    // que armar el filtro con toISOString() erraría el mes durante la tarde del
    // día 1 y del último día.
    const month = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-01`;

    const { data, error } = await this.client
      .from('revenue_by_category')
      .select('category_name, total, cost, profit')
      .eq('month', month)
      .order('total', { ascending: false });
    if (error) throw error;

    return (data ?? []).map((row: { category_name: string; total: number; cost: number; profit: number }) => ({
      category: row.category_name,
      total: Number(row.total),
      cost: Number(row.cost),
      profit: Number(row.profit),
    }));
  }

  // Cuántos productos distintos, vendidos en el rango, no tienen costo cargado
  // (spec 002, RF-22/RF-23). `from`/`to` en 'YYYY-MM-DD', hora de Bolivia.
  async zeroCostProductCount(from: string, to: string): Promise<number> {
    const { data, error } = await this.client.rpc('zero_cost_product_count', {
      p_from: from,
      p_to: to,
    });
    if (error) throw error;
    return Number(data ?? 0);
  }
}
