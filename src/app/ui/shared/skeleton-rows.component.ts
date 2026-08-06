import { ChangeDetectionStrategy, Component, computed, input } from '@angular/core';

// Esqueleto de carga para listados y tablas.
//
// Reemplaza al "Cargando…" suelto y centrado. La diferencia no es estética:
// el texto ocupaba una línea y, al llegar los datos, la tabla aparecía de
// golpe y empujaba todo lo de abajo. El esqueleto ocupa desde el principio
// un alto parecido al del contenido real, así que la página no salta.
//
// Los anchos de las barras se alternan en vez de ser todos iguales: una
// grilla perfectamente pareja se lee como un patrón y llama la atención
// sobre sí misma, justo lo contrario de lo que tiene que hacer algo que
// está ahí solo mientras se espera.
@Component({
  selector: 'app-skeleton-rows',
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <div class="divide-y divide-border-subtle" aria-hidden="true">
      @for (row of rowList(); track row) {
        <div class="px-6 py-3.5 flex items-center gap-4">
          @for (w of widths(); track $index) {
            <div class="skeleton h-3.5" [style.width]="w"></div>
          }
        </div>
      }
    </div>
    <span class="sr-only" role="status">Cargando…</span>
  `,
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
export class SkeletonRowsComponent {
  readonly rows = input<number>(5);

  // Proporciones de las columnas simuladas. La primera más ancha, como
  // suele ser la columna de nombre en estas tablas.
  readonly widths = input<string[]>(['32%', '18%', '14%', '20%']);

  protected readonly rowList = computed(() =>
    Array.from({ length: Math.max(1, this.rows()) }, (_, i) => i),
  );
}
