export type PlanType = 'caja' | 'negocio' | 'custom';
export type PaymentMethod = 'efectivo' | 'tarjeta' | 'qr' | 'transferencia';

export const PLAN_LABELS: Record<PlanType, string> = {
  caja:    'Caja',
  negocio: 'Negocio',
  custom:  'Personalizado',
};

export const PLAN_FEES: Record<Exclude<PlanType, 'custom'>, number> = {
  caja:    149,
  negocio: 349,
};

// ── Features por plan ────────────────────────────────────────────────────
// Fuente única de verdad del reparto. Debe coincidir con plan_allows() en
// Postgres (supabase/migrations/20260802000005_plan_features.sql) y con la
// tabla de precios del landing.
//
// Solo se listan las features RESTRINGIDAS. Todo lo que no está acá — POS,
// offline, productos, categorías, clientes, stock y alertas, historial,
// arqueos de caja, ventas del día — va en los dos planes.
export type PlanFeature =
  | 'purchases'         // proveedores, compras, órdenes de compra
  | 'advanced_reports'  // ingresos diario/mensual, detalle de ventas con
                        // filtros, reportes de clientes y exportación
  | 'staff'             // personal, sueldos y reporte de planilla
  | 'branding';         // tema y logo propios

const RESTRICTED_FEATURES: readonly PlanFeature[] = [
  'purchases', 'advanced_reports', 'staff', 'branding',
];

export function planAllows(plan: PlanType | null, feature: PlanFeature): boolean {
  // Sin plan cargado se asume acceso completo, igual que con el bloqueo por
  // vencimiento: no dejar gente afuera por un dato que falta.
  if (plan === null || plan === 'negocio' || plan === 'custom') return true;
  return !RESTRICTED_FEATURES.includes(feature);
}

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

// Días de gracia tras end_date antes de cortar la operación.
// Debe coincidir con el 5 de la función subscription_blocked() en Postgres
// (supabase/migrations/20260802000002_subscription_enforcement.sql).
export const SUBSCRIPTION_GRACE_DAYS = 5;

export interface SubscriptionStatus {
  daysUntilExpiry: number;
  isExpiringSoon: boolean;
  isExpired: boolean;  // pasó end_date, todavía dentro de la gracia
  isBlocked: boolean;  // gracia agotada o cancelada → no puede vender
}

// Fuente única de verdad del vencimiento en el cliente. El bloqueo real lo
// aplica Postgres; esto solo decide qué mostrar y qué navegación permitir.
export function evaluateSubscription(
  sub: BusinessSubscription,
  today: Date = new Date(),
): SubscriptionStatus {
  // 'T00:00:00' fuerza a interpretar la fecha en hora local. Sin eso el string
  // 'YYYY-MM-DD' se parsea como UTC y en Bolivia (UTC-4) retrocede un día,
  // venciendo las suscripciones 24 h antes de tiempo.
  const end = new Date(`${sub.end_date.slice(0, 10)}T00:00:00`);
  const start = new Date(today);
  start.setHours(0, 0, 0, 0);

  const daysUntilExpiry = Math.ceil(
    (end.getTime() - start.getTime()) / (1000 * 60 * 60 * 24),
  );

  return {
    daysUntilExpiry,
    isExpiringSoon: daysUntilExpiry >= 0 && daysUntilExpiry <= 5,
    isExpired: daysUntilExpiry < 0,
    isBlocked:
      sub.status === 'cancelled' || daysUntilExpiry < -SUBSCRIPTION_GRACE_DAYS,
  };
}
