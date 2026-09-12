import { ChangeDetectionStrategy, Component } from '@angular/core';

// Resplandores de marca del fondo: dos elipses de luz ambiente detrás del
// rail y del contenido, igual que en el diseño de Pencil. Es un componente
// sin lógica -solo maquetación- para no repetir el mismo bloque en los tres
// shells (admin/caja/saas).
//
// Geometría tomada tal cual del diseño, sobre un frame de referencia de
// 1440x960, expresada en porcentajes para que escale con el viewport real:
// - Violeta: elipse 1100x820 en (520, -380) -> arriba a la derecha.
// - Cian:    elipse 820x640 en (-180, 560)  -> abajo a la izquierda.
//
// `-z-10` y `fixed inset-0` en el contenedor: así el degradado queda
// detrás de todo el contenido y no se recorta al hacer scroll.
//
// OJO: esto depende de que el color de fondo del tema esté SOLO en <html>
// y no también en <body> -ver el comentario de "Page background" en
// styles.css-. Un z-index negativo se pinta antes que el fondo de los
// bloques en flujo, así que un background en el body lo tapa entero y
// este componente deja de verse sin que nada falle.
@Component({
  selector: 'app-ambient-glow',
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <div aria-hidden="true" class="pointer-events-none fixed inset-0 -z-10 overflow-hidden">
      <div class="ambient-primary absolute rounded-full w-[76.4%] h-[85.4%] left-[36.1%] -top-[39.6%]"></div>
      <div class="ambient-accent absolute rounded-full w-[56.9%] h-[66.7%] -left-[12.5%] top-[58.3%]"></div>
    </div>
  `,
})
export class AmbientGlowComponent {}
