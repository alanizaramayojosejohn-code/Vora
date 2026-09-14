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
  templateUrl: './ambient-glow.component.html',
})
export class AmbientGlowComponent {}
