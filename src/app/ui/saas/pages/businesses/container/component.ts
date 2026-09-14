import { ChangeDetectionStrategy, Component, computed, inject, signal } from '@angular/core';
import { Router } from '@angular/router';
import { Business } from '../../../../../models/business.model';
import { BusinessSubscription } from '../../../../../models/subscription.model';
import { BusinessService } from '../../../../../services/business/business.service';
import { BusinessQueryService } from '../../../../../services/business/query.service';
import { SubscriptionService } from '../../../../../services/subscription/subscription.service';
import { errorMessage } from '../../../../../utilities/error-message';
import { ConfirmDeleteModalComponent } from '../../../../shared/confirm-delete-modal.component';
import { createCrudState } from '../../../../shared/crud-state';
import { FormModalComponent } from '../../../../shared/form-modal.component';
import { BusinessesFormComponent, BusinessFormValue } from '../components/form/form';
import { BusinessesListComponent } from '../components/list/list';

@Component({
  selector: 'app-saas-businesses',
  imports: [FormModalComponent, BusinessesListComponent, BusinessesFormComponent, ConfirmDeleteModalComponent],
  templateUrl: './component.html',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class SaasBusinessesContainerComponent {
  private readonly businessService     = inject(BusinessService);
  private readonly businessQuery       = inject(BusinessQueryService);
  private readonly subscriptionService = inject(SubscriptionService);
  private readonly router              = inject(Router);

  // Map businessId → subscription para pasarle al form al editar. No entra
  // en el CRUD genérico: es un recurso propio, cargado junto a la lista de
  // negocios dentro de `list` (ver abajo) pero con su propio best-effort.
  private readonly subsMap = signal<Map<string, BusinessSubscription>>(new Map());

  // No entra en el CRUD genérico: handleSubmit de negocios hace un alta/edición
  // multi-paso (logo, suscripción) y redirige a /login si la sesión expiró
  // a mitad de camino — nada de eso es común con las otras 7 pantallas.
  private readonly crud = createCrudState<Business, never>({
    list: async () => {
      const items = await this.businessQuery.listBusinesses();
      // Suscripciones en paralelo: si fallan, los negocios igual se muestran.
      try {
        const subs = await this.subscriptionService.listBusinessesWithSubscriptions();
        const map = new Map<string, BusinessSubscription>();
        for (const item of subs) {
          if (item.subscription) map.set(item.business.id, item.subscription);
        }
        this.subsMap.set(map);
      } catch (err: unknown) {
        console.error('Error listando suscripciones', err);
      }
      return items;
    },
    remove: (id) => this.businessService.deleteBusiness(id),
    labels: {
      load: 'Error al listar negocios',
      remove: 'Error al borrar negocio',
    },
  });

  readonly businesses = this.crud.items;
  readonly loading    = this.crud.loading;
  readonly loadError  = this.crud.loadError;

  readonly formState = this.crud.formState;
  readonly editing    = this.crud.editing;
  readonly editingSubscription = computed<BusinessSubscription | null>(() => {
    const b = this.editing();
    return b ? (this.subsMap().get(b.id) ?? null) : null;
  });
  readonly showForm = this.crud.showForm;

  readonly submitting = this.crud.submitting;
  readonly formError  = this.crud.formError;

  readonly deleting            = this.crud.deleting;
  readonly deletingError       = this.crud.deletingError;
  readonly deletingSubmitting  = this.crud.deletingSubmitting;
  readonly deletingInitials    = this.crud.deletingInitials;
  readonly deletingSublabel = computed(() => this.deleting()?.name ?? null);

  readonly refresh = this.crud.refresh;
  readonly openCreate = this.crud.openCreate;
  readonly openEdit = this.crud.openEdit;
  readonly closeForm = this.crud.closeForm;
  readonly handleDelete = this.crud.handleDelete;
  readonly cancelDelete = this.crud.cancelDelete;
  readonly confirmDelete = this.crud.confirmDelete;

  constructor() {
    void this.refresh();
  }

  async handleSubmit(input: BusinessFormValue): Promise<void> {
    this.submitting.set(true);
    this.formError.set(null);
    const editing = this.editing();
    try {
      let businessId: string;

      if (editing) {
        businessId = editing.id;
        let logo_url: string | null | undefined = undefined;
        if (input.removeLogo) {
          await this.businessService.removeLogo(businessId);
          logo_url = null;
        } else if (input.logoFile) {
          logo_url = await this.businessService.uploadLogo(input.logoFile, businessId);
        }
        await this.businessService.updateBusiness(businessId, {
          name:  input.businessName,
          theme: input.theme,
          owner: input.owner,
          ...(logo_url !== undefined ? { logo_url } : {}),
        });
        // Actualizar suscripción si se eligió un plan
        if (input.plan) {
          const existing = this.subsMap().get(businessId);
          await this.subscriptionService.upsertSubscription({
            business_id: businessId,
            plan_type:   input.plan.plan_type,
            monthly_fee: input.plan.monthly_fee,
            // Mantener fechas existentes; si no hay suscripción, crear con fechas nuevas
            start_date:  existing?.start_date ?? new Date().toISOString().slice(0, 10),
            end_date:    existing?.end_date   ?? (() => {
              const d = new Date(); d.setMonth(d.getMonth() + 1); return d.toISOString().slice(0, 10);
            })(),
          });
        }
      } else {
        businessId = await this.businessService.createBusinessWithAdmin({
          businessName: input.businessName,
          adminUserId:  input.adminUserId,
          adminName:    input.adminName,
          adminCi:      input.adminCi,
          theme:        input.theme,
          owner:        input.owner ?? undefined,
        });
        if (input.logoFile) {
          const logoUrl = await this.businessService.uploadLogo(input.logoFile, businessId);
          await this.businessService.updateBusiness(businessId, {
            name:     input.businessName,
            logo_url: logoUrl,
          });
        }
        if (input.plan) {
          const today     = new Date().toISOString().slice(0, 10);
          const nextMonth = new Date();
          nextMonth.setMonth(nextMonth.getMonth() + 1);
          await this.subscriptionService.upsertSubscription({
            business_id: businessId,
            plan_type:   input.plan.plan_type,
            monthly_fee: input.plan.monthly_fee,
            start_date:  today,
            end_date:    nextMonth.toISOString().slice(0, 10),
          });
        }
      }

      this.formState.set(null);
      await this.refresh();
    } catch (err: unknown) {
      if (err instanceof Error && (err as Error & { code?: string }).code === 'SESSION_EXPIRED') {
        await this.router.navigate(['/login']);
        return;
      }
      this.formError.set(
        errorMessage(err, editing ? 'Error al guardar negocio' : 'Error al crear negocio'),
      );
    } finally {
      this.submitting.set(false);
    }
  }
}
