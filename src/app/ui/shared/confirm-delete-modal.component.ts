import { ChangeDetectionStrategy, Component, computed, effect, input, output, signal } from '@angular/core';

// Modal de confirmación de borrado replicando el diseño del pencil:
// backdrop blureado, card centrado con icon-box negra arriba, título,
// descripción, summary card de la entidad, campo "Escribe X" para confirmar
// (opcional segun confirmWord), footer con Cancelar + Eliminar danger.
//
// Diseño "type to confirm" copia el patrón GitHub/Stripe: para borrados
// con cascada (negocios, socios, colaboradores) requiere tipear la palabra.
// Para borrados livianos (productos, planes) confirmWord queda en null y
// el botón Eliminar se habilita inmediato.
@Component({
  selector: 'app-confirm-delete',
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: './confirm-delete-modal.component.html',
})
export class ConfirmDeleteModalComponent {
  // Visibilidad — el padre controla el open/close.
  readonly open = input<boolean>(false);

  // Texto principal del modal.
  readonly title = input.required<string>();
  readonly description = input.required<string>();
  readonly confirmLabel = input<string>('Eliminar');

  // Summary de la entidad a borrar (todo opcional — si no se pasan,
  // el modal queda solo con el título y el botón).
  readonly entityLabel = input<string | null>(null);
  readonly entitySublabel = input<string | null>(null);
  readonly entityInitials = input<string | null>(null);
  readonly amount = input<string | null>(null);
  readonly amountLabel = input<string | null>(null);

  // Si se pasa, requiere que el usuario tipee esa palabra para confirmar.
  // Patrón "type to confirm" — útil para borrados con cascada.
  readonly confirmWord = input<string | null>(null);

  // Cuando submitting=true muestra spinner y deshabilita el botón.
  readonly submitting = input<boolean>(false);

  readonly confirmed = output<void>();
  readonly cancelled = output<void>();

  // Estado interno del input "type to confirm".
  readonly typedValue = signal<string>('');

  // Limpia el input cada vez que el modal se cierra/abre.
  constructor() {
    effect(() => {
      // Watcher sobre open(): al cerrar reseteamos el typed.
      if (!this.open()) this.typedValue.set('');
    });
  }

  readonly canConfirm = computed(() => {
    if (this.submitting()) return false;
    const word = this.confirmWord();
    if (word) return this.typedValue() === word;
    return true;
  });

  onTypeInput(value: string): void {
    this.typedValue.set(value);
  }

  onConfirm(): void {
    if (!this.canConfirm()) return;
    this.confirmed.emit();
  }

  onCancel(): void {
    this.cancelled.emit();
  }

  onBackdropClick(_e: MouseEvent): void {
    if (this.submitting()) return; // no cerrar mientras está borrando
    this.onCancel();
  }
}
