import { ChangeDetectionStrategy, Component, computed, inject, signal } from '@angular/core';
import { Router } from '@angular/router';
import { Business } from '../../../../../models/business.model';
import { BusinessSubscription } from '../../../../../models/subscription.model';
import { BusinessService } from '../../../../../services/business/business.service';
import { BusinessQueryService } from '../../../../../services/business/query.service';
import { SubscriptionService } from '../../../../../services/subscription/subscription.service';
import { errorMessage } from '../../../../../utilities/error-message';
import { ConfirmDeleteModalComponent } from '../../../../shared/confirm-delete-modal.component';
import { BusinessesFormComponent, BusinessFormValue } from '../components/form/form';
import { BusinessesListComponent } from '../components/list/list';

@Component({
  selector: 'app-saas-businesses',
  imports: [BusinessesListComponent, BusinessesFormComponent, ConfirmDeleteModalComponent],
  templateUrl: './component.html',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class SaasBusinessesContainerComponent {
  private readonly businessService     = inject(BusinessService);
  private readonly businessQuery       = inject(BusinessQueryService);
  private readonly subscriptionService = inject(SubscriptionService);
  private readonly router              = inject(Router);

  readonly businesses = signal<Business[]>([]);
  readonly loading    = signal(false);

  // Map businessId → subscription para pasarle al form al editar
  private readonly subsMap = signal<Map<string, BusinessSubscription>>(new Map());

  readonly formState = signal<null | 'create' | Business>(null);
  readonly editing   = computed<Business | null>(() => {
    const s = this.formState();
    return s && s !== 'create' ? s : null;
  });
  readonly editingSubscription = computed<BusinessSubscription | null>(() => {
    const b = this.editing();
    return b ? (this.subsMap().get(b.id) ?? null) : null;
  });
  readonly showForm = computed(() => this.formState() !== null);

  readonly submitting = signal(false);
  readonly formError  = signal<string | null>(null);

  // Modal de borrado
  readonly deleting            = signal<Business | null>(null);
  readonly deletingError       = signal<string | null>(null);
  readonly deletingSubmitting  = signal(false);

  readonly deletingInitials = computed(() => {
    const b = this.deleting();
    if (!b) return null;
    const parts = b.name.trim().split(/\s+/).filter(Boolean);
    if (parts.length === 0) return null;
    if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
    return (parts[0][0] + parts[1][0]).toUpperCase();
  });

  readonly deletingSublabel = computed(() => this.deleting()?.name ?? null);

  constructor() {
    void this.refresh();
  }

  async refresh(): Promise<void> {
    this.loading.set(true);
    try {
      this.businesses.set(await this.businessQuery.listBusinesses());
    } catch (err: unknown) {
      console.error('Error listando negocios', err);
    } finally {
      this.loading.set(false);
    }
    // Suscripciones en paralelo: si fallan, los negocios igual se muestran
    try {
      const items = await this.subscriptionService.listBusinessesWithSubscriptions();
      const map = new Map<string, BusinessSubscription>();
      for (const item of items) {
        if (item.subscription) map.set(item.business.id, item.subscription);
      }
      this.subsMap.set(map);
    } catch (err: unknown) {
      console.error('Error listando suscripciones', err);
    }
  }

  openCreate(): void {
    this.formState.set('create');
    this.formError.set(null);
  }

  openEdit(business: Business): void {
    this.formState.set(business);
    this.formError.set(null);
  }

  closeForm(): void {
    this.formState.set(null);
    this.formError.set(null);
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
      if (err instanceof Error && (err as any)['code'] === 'SESSION_EXPIRED') {
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

  handleDelete(business: Business): void {
    this.deleting.set(business);
    this.deletingError.set(null);
  }

  cancelDelete(): void {
    if (this.deletingSubmitting()) return;
    this.deleting.set(null);
    this.deletingError.set(null);
  }

  async confirmDelete(): Promise<void> {
    const business = this.deleting();
    if (!business) return;
    this.deletingSubmitting.set(true);
    this.deletingError.set(null);
    try {
      await this.businessService.deleteBusiness(business.id);
      if (this.editing()?.id === business.id) this.formState.set(null);
      this.deleting.set(null);
      await this.refresh();
    } catch (err: unknown) {
      this.deletingError.set(errorMessage(err, 'Error al borrar negocio'));
    } finally {
      this.deletingSubmitting.set(false);
    }
  }
}
