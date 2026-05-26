import { inject, Injectable } from '@angular/core';
import { Business } from '../../models/business.model';
import { BusinessSubscription, PaymentMethod, PlanType, SubscriptionPayment } from '../../models/subscription.model';
import { SupabaseService } from '../supabase/supabase.service';

export interface BusinessWithSubscription {
  business: Business;
  subscription: BusinessSubscription | null;
  daysUntilExpiry: number | null;
  isExpiringSoon: boolean;
  isExpired: boolean;
}

export interface UpsertSubscriptionInput {
  business_id: string;
  plan_type: PlanType;
  monthly_fee: number;
  start_date: string;
  end_date: string;
}

export interface CreateSubscriptionPaymentInput {
  subscription_id: string;
  business_id: string;
  amount: number;
  period_label: string;
  paid_at: string;
  payment_method: PaymentMethod;
  is_late: boolean;
  notes: string | null;
}

@Injectable({ providedIn: 'root' })
export class SubscriptionService {
  private readonly client = inject(SupabaseService).client;

  async listBusinessesWithSubscriptions(): Promise<BusinessWithSubscription[]> {
    const [{ data: businesses, error: bErr }, { data: subs, error: sErr }] = await Promise.all([
      this.client.from('businesses').select('*').order('name'),
      this.client.from('business_subscriptions').select('*'),
    ]);
    if (bErr) throw bErr;
    if (sErr) throw sErr;

    const subsMap = new Map<string, BusinessSubscription>(
      (subs as BusinessSubscription[]).map((s) => [s.business_id, s]),
    );

    const today = new Date();
    today.setHours(0, 0, 0, 0);

    return (businesses as Business[]).map((b) => {
      const sub = subsMap.get(b.id) ?? null;
      if (!sub) return { business: b, subscription: null, daysUntilExpiry: null, isExpiringSoon: false, isExpired: false };

      const end = new Date(sub.end_date);
      end.setHours(0, 0, 0, 0);
      const diffMs = end.getTime() - today.getTime();
      const daysUntilExpiry = Math.ceil(diffMs / (1000 * 60 * 60 * 24));

      return {
        business: b,
        subscription: sub,
        daysUntilExpiry,
        isExpiringSoon: daysUntilExpiry >= 0 && daysUntilExpiry <= 5,
        isExpired: daysUntilExpiry < 0,
      };
    });
  }

  async upsertSubscription(input: UpsertSubscriptionInput): Promise<BusinessSubscription> {
    const { data, error } = await this.client
      .from('business_subscriptions')
      .upsert(
        { ...input, status: 'active' },
        { onConflict: 'business_id' },
      )
      .select()
      .single();
    if (error) throw error;
    return data as BusinessSubscription;
  }

  async extendSubscription(id: string, newEndDate: string): Promise<void> {
    const { error } = await this.client
      .from('business_subscriptions')
      .update({ end_date: newEndDate, status: 'active' })
      .eq('id', id);
    if (error) throw error;
  }

  async listPayments(businessId: string): Promise<SubscriptionPayment[]> {
    const { data, error } = await this.client
      .from('subscription_payments')
      .select('*')
      .eq('business_id', businessId)
      .order('paid_at', { ascending: false });
    if (error) throw error;
    return data as SubscriptionPayment[];
  }

  async createPayment(input: CreateSubscriptionPaymentInput): Promise<void> {
    const { error } = await this.client.from('subscription_payments').insert(input);
    if (error) throw error;
  }

  async deletePayment(id: string): Promise<void> {
    const { error } = await this.client.from('subscription_payments').delete().eq('id', id);
    if (error) throw error;
  }

  nextEndDate(currentEndDate: string, months: number = 1): string {
    const d = new Date(currentEndDate);
    d.setMonth(d.getMonth() + months);
    return d.toISOString().slice(0, 10);
  }
}
