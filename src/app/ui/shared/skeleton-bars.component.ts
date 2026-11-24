import { ChangeDetectionStrategy, Component, computed, input } from '@angular/core';

// Esqueleto de carga para los bloques que muestran barras: ingresos por
// categoría, desglose por método de pago, top de productos.
//
// Es distinto del de filas a propósito. Un esqueleto tiene que anticipar la
// forma de lo que viene; si mientras carga un gráfico se muestran renglones
// de tabla, al llegar los datos el bloque cambia de silueta y el salto se
// nota más que si no hubiera habido nada.
//
// Cada línea es una etiqueta corta arriba y una barra abajo, que es
// exactamente la estructura de esos bloques. Los anchos decrecen porque las
// barras vienen ordenadas de mayor a menor.
@Component({
  selector: 'app-skeleton-bars',
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: './skeleton-bars.component.html',
  styles: `
    .sr-only {
      position: absolute;
      width: 1px;
      height: 1px;
      padding: 0;
      margin: -1px;
      overflow: hidden;
      clip: rect(0 0 0 0);
      white-space: nowrap;
      border: 0;
    }
  `,
})
export class SkeletonBarsComponent {
  readonly bars = input<number>(4);

  protected readonly widths = computed(() => {
    const n = Math.max(1, this.bars());
    // De 100% a 30%, repartido entre la cantidad de barras.
    return Array.from({ length: n }, (_, i) =>
      `${Math.round(100 - (i * 70) / Math.max(1, n - 1))}%`,
    );
  });
}
