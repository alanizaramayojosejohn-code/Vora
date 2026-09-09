import { ChangeDetectionStrategy, Component, input } from '@angular/core';
import { RouterLink } from '@angular/router';

// Aviso de RF-23 (spec 002): se repite en cada reporte que muestra ganancia
// (día, mensual, top de productos, categorías, detalle de ventas), así que
// vive una sola vez acá en vez de cinco copias del mismo párrafo.
//
// `count` en null mientras no se sabe todavía (carga en curso, o el reporte
// no llegó a pedirlo): en ese estado no se muestra nada, ni un "0 productos"
// que sería ruido en el caso normal.
@Component({
  selector: 'app-zero-cost-notice',
  imports: [RouterLink],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    @if (count(); as n) {
      <div class="flex items-center gap-2.5 px-4 py-2.5 bg-warning/10 border border-warning/25 text-warning rounded-xl text-xs font-medium">
        <svg class="flex-shrink-0" xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round">
          <circle cx="12" cy="12" r="10"/><line x1="12" x2="12" y1="8" y2="12"/><line x1="12" x2="12.01" y1="16" y2="16"/>
        </svg>
        <span class="flex-1 min-w-0">
          {{ n }} {{ n === 1 ? 'producto vendido no tiene' : 'productos vendidos no tienen' }} costo cargado — la ganancia mostrada está sobrestimada.
        </span>
        <a routerLink="/admin/products"
           class="font-semibold underline underline-offset-2 hover:no-underline flex-shrink-0">
          Cargar costos
        </a>
      </div>
    }
  `,
})
export class ZeroCostNoticeComponent {
  readonly count = input<number | null>(null);
}
