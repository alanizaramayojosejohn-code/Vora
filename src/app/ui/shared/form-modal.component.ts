import {
  ChangeDetectionStrategy,
  Component,
  effect,
  input,
  output,
} from '@angular/core';

// Ventana modal para los formularios de crear y editar.
//
// Antes cada formulario se abría empujando el listado hacia abajo: en una
// tabla larga quedaba fuera de pantalla y el usuario no veía que se había
// abierto. Acá aparece encima, con el listado de fondo, que es lo que se
// espera de una acción puntual.
//
// Este componente aporta SOLO la caja: el fondo oscurecido, el panel y el
// botón de cerrar. El contenido va por proyección y cada formulario conserva
// su propio encabezado, porque varios muestran ahí datos que hacen falta
// —de qué negocio es la suscripción, a qué empleado se le paga, cuál es la
// tarifa vigente— y un título genérico los perdería.
//
// Se cierra con la X, con Escape o clickeando afuera; nunca mientras guarda.
@Component({
  selector: 'app-form-modal',
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: {
    '(document:keydown.escape)': 'onEscape()',
  },
  templateUrl: './form-modal.component.html',
})
export class FormModalComponent {
  readonly open = input<boolean>(false);

  // Solo para lectores de pantalla: el título visible lo pone el formulario.
  readonly label = input<string>('Formulario');

  // Los formularios de una o dos columnas entran en 2xl; el de negocios y el
  // de productos necesitan más aire.
  readonly widthClass = input<string>('max-w-2xl');

  // Mientras se guarda no se puede cerrar: perder un formulario lleno por un
  // Escape o un click al costado es de las cosas que más molestan.
  readonly submitting = input<boolean>(false);

  readonly closed = output<void>();

  constructor() {
    // Con el modal abierto se bloquea el scroll del fondo. Sin esto, en el
    // teléfono se arrastra el listado de atrás en vez del formulario.
    effect((onCleanup) => {
      if (!this.open()) return;
      const previous = document.body.style.overflow;
      document.body.style.overflow = 'hidden';
      onCleanup(() => {
        document.body.style.overflow = previous;
      });
    });
  }

  onClose(): void {
    if (this.submitting()) return;
    this.closed.emit();
  }

  onBackdropClick(): void {
    this.onClose();
  }

  onEscape(): void {
    if (!this.open()) return;
    this.onClose();
  }
}
