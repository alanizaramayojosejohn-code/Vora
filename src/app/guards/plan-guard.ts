import { inject } from '@angular/core';
import { CanActivateFn, Router } from '@angular/router';
import { PlanFeature } from '../models/subscription.model';
import { AuthService } from '../services/auth/auth.service';
import { SubscriptionStateService } from '../services/subscription/subscription-state.service';

// Bloquea rutas que no están en el plan del negocio.
//
// Ocultar el ítem del menú no alcanza: la URL se escribe a mano. Aun así esto
// sigue siendo UX — quien tenga la consola abierta puede llegar a la vista.
// Las ESCRITURAS las corta plan_allows() en Postgres; las lecturas de reportes
// solo se protegen acá (ver nota en 20260802000005_plan_features.sql).
export function planGuard(feature: PlanFeature): CanActivateFn {
  return async () => {
    const router = inject(Router);
    if (inject(AuthService).role() === 'super_admin') return true;

    const state = inject(SubscriptionStateService);
    await state.ensureLoaded();
    return state.allows(feature) ? true : router.parseUrl('/admin/home');
  };
}
