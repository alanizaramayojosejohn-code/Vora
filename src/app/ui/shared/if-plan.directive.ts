import {
  Directive,
  effect,
  inject,
  input,
  TemplateRef,
  ViewContainerRef,
} from '@angular/core';
import { PlanFeature } from '../../models/subscription.model';
import { SubscriptionStateService } from '../../services/subscription/subscription-state.service';

// Renderiza el contenido solo si el plan del negocio incluye la feature.
//
//   <a *appIfPlan="'purchases'" routerLink="/admin/purchases">Compras</a>
//
// Se usa para ocultar ítems de menú y secciones. No es seguridad: el corte de
// escritura vive en Postgres.
@Directive({
  selector: '[appIfPlan]',
})
export class IfPlanDirective {
  private readonly template = inject(TemplateRef<unknown>);
  private readonly view = inject(ViewContainerRef);
  private readonly state = inject(SubscriptionStateService);

  readonly appIfPlan = input.required<PlanFeature>();

  private visible: boolean | null = null;

  constructor() {
    void this.state.ensureLoaded();

    effect(() => {
      // Se lee `plan()` para que el efecto reaccione cuando llegue la carga.
      this.state.plan();
      const allowed = this.state.allows(this.appIfPlan());

      if (allowed === this.visible) return;
      this.visible = allowed;

      this.view.clear();
      if (allowed) this.view.createEmbeddedView(this.template);
    });
  }
}
