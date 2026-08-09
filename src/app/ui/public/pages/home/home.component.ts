import { ChangeDetectionStrategy, Component, computed, signal } from '@angular/core';
import { RouterLink } from '@angular/router';
import { PLAN_FEES } from '../../../../models/subscription.model';
import { LandingBackdropComponent } from './landing-backdrop.component';

type BillingCycle = 'mensual' | 'anual';

/** Meses que se cobran al pagar el año por adelantado: pagas 10, llevas 12. */
const ANNUAL_MONTHS_CHARGED = 10;

const BOB = new Intl.NumberFormat('es-BO', { maximumFractionDigits: 0 });

/** Lo que entra en los dos planes.
 *
 * Es el complemento de RESTRICTED_FEATURES en models/subscription.model.ts:
 * todo lo que `plan_allows()` no restringe. Si algo se mueve de plan, se
 * toca allá primero —esa es la fuente de verdad— y después acá. */
const FEATURES_BASE: readonly string[] = [
  'Punto de venta: efectivo, tarjeta y QR',
  'Sigue vendiendo sin internet, sincroniza al reconectar',
  'Productos, categorías e historial de ventas',
  'Stock en tiempo real y alertas de bajo inventario',
  'Clientes con NIT y facturación',
  'Cierre de caja y arqueo por turno',
  'Ventas del día: totales, medios de pago y lo más vendido',
  'Cajas y usuarios ilimitados',
];

/** Lo que solo desbloquea Negocio. Coincide con RESTRICTED_FEATURES. */
const FEATURES_NEGOCIO: readonly string[] = [
  'Proveedores, compras y órdenes de compra',
  'Reportes diarios, mensuales y de ventas, con exportación',
  'Reportes de clientes: mejores, inactivos y ticket promedio',
  'Personal, pago de sueldos y reporte de planilla',
  'Tema, colores y logo de tu marca',
  'Soporte prioritario',
];

@Component({
  selector: 'app-home',
  imports: [RouterLink, LandingBackdropComponent],
  templateUrl: './home.component.html',
  styleUrl: './home.component.css',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class HomeComponent {
  readonly featuresBase = FEATURES_BASE;
  readonly featuresNegocio = FEATURES_NEGOCIO;

  readonly year = new Date().getFullYear();

  readonly billing = signal<BillingCycle>('mensual');

  /** Precios ya resueltos para el ciclo elegido.
   *
   * En anual se muestra igual un precio mensual —es la cifra con la que la
   * gente compara— y debajo el total que se cobra de una vez. Mostrar
   * "1.490 Bs" en grande al lado de "149 Bs" del otro plan haría parecer
   * que el plan anual es diez veces más caro. */
  readonly pricing = computed(() => {
    const anual = this.billing() === 'anual';

    const price = (monthlyFee: number) => {
      const perMonth = anual
        ? Math.round((monthlyFee * ANNUAL_MONTHS_CHARGED) / 12)
        : monthlyFee;

      return {
        amount: BOB.format(perMonth),
        note: anual
          ? `${BOB.format(monthlyFee * ANNUAL_MONTHS_CHARGED)} Bs facturados al año`
          : 'Facturación mensual, cancela cuando quieras',
      };
    };

    return {
      caja: price(PLAN_FEES.caja),
      negocio: price(PLAN_FEES.negocio),
    };
  });

  setBilling(cycle: BillingCycle): void {
    this.billing.set(cycle);
  }
}
