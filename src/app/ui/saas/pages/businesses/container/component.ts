import { ChangeDetectionStrategy, Component, inject, signal } from '@angular/core';
import { Business } from '../../../../../models/business.model';
import { BusinessService, CreateBusinessWithAdminInput } from '../../../../../services/business/business.service';
import { BusinessQueryService } from '../../../../../services/business/query.service';
import { BusinessesFormComponent } from '../components/form/form';
import { BusinessesListComponent } from '../components/list/list';

@Component({
  selector: 'app-saas-businesses',
  imports: [BusinessesListComponent, BusinessesFormComponent],
  templateUrl: './component.html',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class SaasBusinessesContainerComponent {
  private readonly businessService = inject(BusinessService);
  private readonly businessQuery = inject(BusinessQueryService);

  readonly businesses = signal<Business[]>([]);
  readonly loading = signal(false);
  readonly showForm = signal(false);
  readonly submitting = signal(false);
  readonly formError = signal<string | null>(null);

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
  }

  toggleForm(): void {
    this.showForm.update((v) => !v);
    this.formError.set(null);
  }

  async handleSubmit(input: CreateBusinessWithAdminInput): Promise<void> {
    this.submitting.set(true);
    this.formError.set(null);
    try {
      await this.businessService.createBusinessWithAdmin(input);
      this.showForm.set(false);
      await this.refresh();
    } catch (err: unknown) {
      this.formError.set(err instanceof Error ? err.message : 'Error al crear negocio');
    } finally {
      this.submitting.set(false);
    }
  }
}
