import { inject, Injectable } from '@angular/core';
import { ActiveMembership } from '../../models/active-membership.model';
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

  async listActiveMemberships(): Promise<ActiveMembership[]> {
    const { data, error } = await this.client
      .from('active_memberships')
      .select('*')
      .order('end_date', { ascending: true });
    if (error) throw error;
    return (data ?? []) as ActiveMembership[];
  }

  async listLowStockProducts(): Promise<LowStockProduct[]> {
    const { data, error } = await this.client
      .from('low_stock_products')
      .select('*')
      .order('stock', { ascending: true });
    if (error) throw error;
    return (data ?? []) as LowStockProduct[];
  }

  async listRevenueByCategoryThisMonth(): Promise<{ category: string; total: number; type: 'product' | 'membership' }[]> {
    const now = new Date();
    const firstDay = new Date(now.getFullYear(), now.getMonth(), 1).toISOString();
    const nextMonth = new Date(now.getFullYear(), now.getMonth() + 1, 1).toISOString();

    const { data, error } = await this.client
      .from('sales')
      .select('amount, type, products(category), client_memberships(membership_plans(name))')
      .is('cancelled_at', null)
      .gte('created_at', firstDay)
      .lt('created_at', nextMonth);
    if (error) throw error;

    const totals = new Map<string, number>();
    const types = new Map<string, 'product' | 'membership'>();
    for (const row of (data ?? []) as any[]) {
      const cat: string = row.type === 'product'
        ? (row.products?.category ?? 'Otros')
        : (row.client_memberships?.membership_plans?.name ?? 'Membresía');
      totals.set(cat, (totals.get(cat) ?? 0) + Number(row.amount));
      if (!types.has(cat)) types.set(cat, row.type as 'product' | 'membership');
    }
    return Array.from(totals.entries())
      .map(([category, total]) => ({ category, total, type: types.get(category)! }))
      .sort((a, b) => b.total - a.total);
  }
}
