import { computed, Directive, inject } from '@angular/core';
import { SubscriptionStateService } from '../../services/subscription/subscription-state.service';

// Deshabilita un control cuando la suscripción está vencida (modo solo
// lectura). Aplicar a botones que abren formularios o disparan escrituras.
//
// Es afordancia, no seguridad: el bloqueo real lo aplica el trigger
// assert_subscription_writable() en Postgres. Acá solo se evita que el usuario
// llene un formulario para chocarse con un error al guardar.
//
// NO usar en botones que ya traen su propio [disabled]: ahí conviene sumar la
// condición a su expresión existente, para que no compitan dos bindings.
@Directive({
  selector: '[appReadonlyDisabled]',
  host: {
    // attr.disabled y no [disabled]: la directiva puede aplicarse a cualquier
    // elemento, así que el compilador no puede validar la propiedad.
    '[attr.disabled]': 'isReadonly() ? "" : null',
    '[attr.aria-disabled]': 'isReadonly()',
    '[class.opacity-50]': 'isReadonly()',
    '[class.cursor-not-allowed]': 'isReadonly()',
    '[attr.title]': 'isReadonly() ? tooltip : null',
  },
})
export class ReadonlyDisabledDirective {
  private readonly state = inject(SubscriptionStateService);

  protected readonly tooltip = 'Suscripción vencida — modo solo lectura';
  protected readonly isReadonly = computed(() => this.state.status()?.isBlocked ?? false);
}
