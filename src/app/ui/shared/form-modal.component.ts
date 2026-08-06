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
  template: `
    @if (open()) {
      <div
        class="anim-backdrop fixed inset-0 z-50 bg-black/50 backdrop-blur-sm flex items-start sm:items-center justify-center p-4 overflow-y-auto"
        (click)="onBackdropClick()">
        <!-- max-h propio: un formulario largo (productos, negocios) scrollea
             dentro de la ventana en vez de estirarla fuera de la pantalla. -->
        <div
          class="anim-panel relative w-full my-auto bg-surface backdrop-blur-xl border border-border-subtle rounded-2xl shadow-2xl shadow-black/30 max-h-[calc(100dvh-2rem)] overflow-y-auto"
          [class]="widthClass()"
          role="dialog"
          aria-modal="true"
          [attr.aria-label]="label()"
          (click)="$event.stopPropagation()">

          <button type="button" (click)="onClose()" [disabled]="submitting()"
                  aria-label="Cerrar"
                  class="absolute top-4 right-4 z-10 w-8 h-8 inline-flex items-center justify-center rounded-lg
                         text-foreground-muted hover:text-foreground hover:bg-muted transition disabled:opacity-40">
            <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24"
                 fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round">
              <path d="M18 6 6 18M6 6l12 12"/>
            </svg>
          </button>

          <ng-content />
        </div>
      </div>
    }
  `,
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
