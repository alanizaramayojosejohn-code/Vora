import { ChangeDetectionStrategy, Component } from '@angular/core';
import { RouterLink } from '@angular/router';

@Component({
  selector: 'app-home',
  imports: [RouterLink],
  templateUrl: './home.component.html',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class HomeComponent {
  // Debe coincidir con PLAN_FEATURES en models/subscription.model.ts y con
  // plan_allows() en Postgres.
  readonly planCaja: readonly string[] = [
    'Punto de venta: efectivo, tarjeta y QR',
    'Sigue vendiendo sin internet',
    'Productos, categorías e historial de ventas',
    'Stock en tiempo real y alertas de bajo inventario',
    'Clientes con NIT',
    'Cierre de caja y arqueo por turno',
    'Cajas y usuarios ilimitados',
  ];

  readonly planNegocio: readonly string[] = [
    'Proveedores, compras y órdenes de compra',
    'Reportes diarios, mensuales y de ventas, con exportación',
    'Personal y pago de sueldos',
    'Tema y logo de tu marca',
    'Soporte prioritario',
  ];
}
