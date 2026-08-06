import {
  ChangeDetectionStrategy,
  Component,
  ElementRef,
  viewChild,
} from '@angular/core';
import { RouterOutlet } from '@angular/router';

// Envoltorio del router-outlet que reproduce una entrada breve en cada
// navegación: la pantalla nueva sube 8 px mientras aparece.
//
// Sirve para algo concreto además de decorar. Al cambiar de ruta el
// contenido se reemplaza de golpe y, cuando dos pantallas se parecen —dos
// listados con la misma cabecera, por ejemplo— cuesta notar que algo pasó.
// El movimiento marca el corte.
//
// Reiniciar la animación pide sacar la clase, forzar un reflow y volver a
// ponerla: sin esa lectura intermedia el navegador junta los dos cambios en
// el mismo frame, no ve diferencia y la animación no se vuelve a disparar.
//
// El transform queda en `none` al terminar, así que no crea un bloque
// contenedor y los modales `fixed` de las páginas siguen anclados a la
// ventana.
@Component({
  selector: 'app-route-view',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [RouterOutlet],
  template: `
    <div #box class="anim-page">
      <router-outlet (activate)="replay()" />
    </div>
  `,
})
export class RouteViewComponent {
  private readonly box = viewChild.required<ElementRef<HTMLElement>>('box');

  replay(): void {
    const el = this.box().nativeElement;
    el.classList.remove('anim-page');
    void el.offsetWidth;
    el.classList.add('anim-page');
  }
}
