import { ChangeDetectionStrategy, Component, inject, signal } from '@angular/core';
import { MembershipPlanWithServices } from '../../../../../models/membership-plan.model';
import { Service } from '../../../../../models/service.model';
import { CreateMembershipPlanInput, MembershipPlanService } from '../../../../../services/membership-plan/membership-plan.service';
import { MembershipPlanQueryService } from '../../../../../services/membership-plan/query.service';
import { ServiceQueryService } from '../../../../../services/service/query.service';
import { MembershipPlansFormComponent } from '../components/form/form';
import { MembershipPlansListComponent } from '../components/list/list';

@Component({
  selector: 'app-admin-membership-plans',
  imports: [MembershipPlansListComponent, MembershipPlansFormComponent],
  templateUrl: './component.html',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class AdminMembershipPlansContainerComponent {
  private readonly planService = inject(MembershipPlanService);
  private readonly planQuery = inject(MembershipPlanQueryService);
  private readonly serviceQuery = inject(ServiceQueryService);

  readonly plans = signal<MembershipPlanWithServices[]>([]);
  readonly services = signal<Service[]>([]);
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
      const [plans, services] = await Promise.all([
        this.planQuery.listPlans(),
        this.serviceQuery.listServices(),
      ]);
      this.plans.set(plans);
      this.services.set(services);
    } catch (err: unknown) {
      console.error('Error listando planes', err);
    } finally {
      this.loading.set(false);
    }
  }

  toggleForm(): void {
    this.showForm.update((v) => !v);
    this.formError.set(null);
  }

  async handleSubmit(input: CreateMembershipPlanInput): Promise<void> {
    this.submitting.set(true);
    this.formError.set(null);
    try {
      await this.planService.createPlan(input);
      this.showForm.set(false);
      await this.refresh();
    } catch (err: unknown) {
      this.formError.set(err instanceof Error ? err.message : 'Error al crear plan');
    } finally {
      this.submitting.set(false);
    }
  }
}
