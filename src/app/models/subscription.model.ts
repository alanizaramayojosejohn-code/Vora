export type PlanType = 'basico' | 'pro' | 'enterprise' | 'custom';
export type PaymentMethod = 'efectivo' | 'tarjeta' | 'qr' | 'transferencia';

export const PLAN_LABELS: Record<PlanType, string> = {
  basico:     'Básico',
  pro:        'Pro',
  enterprise: 'Enterprise',
  custom:     'Personalizado',
};

export const PLAN_FEES: Record<Exclude<PlanType, 'custom'>, number> = {
  basico:     150,
  pro:        180,
  enterprise: 210,
};

export const PAYMENT_METHOD_LABELS: Record<PaymentMethod, string> = {
  efectivo:      'Efectivo',
  tarjeta:       'Tarjeta',
  qr:            'QR',
  transferencia: 'Transferencia',
};

export interface BusinessSubscription {
  id: string;
  business_id: string;
  plan_type: PlanType;
  monthly_fee: number;
  start_date: string;
  end_date: string;
  status: 'active' | 'expired' | 'cancelled';
  created_at: string;
}

export interface SubscriptionPayment {
  id: string;
  subscription_id: string;
  business_id: string;
  amount: number;
  period_label: string;
  paid_at: string;
  payment_method: PaymentMethod;
  is_late: boolean;
  notes: string | null;
  created_at: string;
}
