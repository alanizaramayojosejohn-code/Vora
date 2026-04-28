import { ChangeDetectionStrategy, Component, computed, inject, signal } from '@angular/core';
import { Client } from '../../../../../models/client.model';
import { MembershipPlan } from '../../../../../models/membership-plan.model';
import { Product } from '../../../../../models/product.model';
import { SaleWithDetails } from '../../../../../models/sale.model';
import { AuthService } from '../../../../../services/auth/auth.service';
import { ClientQueryService } from '../../../../../services/client/query.service';
import { MembershipPlanQueryService } from '../../../../../services/membership-plan/query.service';
import { ProductQueryService } from '../../../../../services/product/query.service';
import { RegisterSaleMembershipInput, RegisterSaleProductInput, SaleService } from '../../../../../services/sale/sale.service';
import { SaleQueryService } from '../../../../../services/sale/query.service';
import { SalesMembershipFormComponent } from '../components/membership-form/membership-form';
import { SalesProductFormComponent } from '../components/product-form/product-form';
import { SalesListComponent } from '../components/list/list';

type FormTab = null | 'product' | 'membership';

@Component({
  selector: 'app-caja-sales',
  imports: [SalesProductFormComponent, SalesMembershipFormComponent, SalesListComponent],
  templateUrl: './component.html',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class CajaSalesContainerComponent {
  private readonly saleService = inject(SaleService);
  private readonly saleQuery = inject(SaleQueryService);
  private readonly productQuery = inject(ProductQueryService);
  private readonly clientQuery = inject(ClientQueryService);
  private readonly planQuery = inject(MembershipPlanQueryService);
  private readonly auth = inject(AuthService);

  readonly sales = signal<SaleWithDetails[]>([]);
  readonly products = signal<Product[]>([]);
  readonly clients = signal<Client[]>([]);
  readonly plans = signal<MembershipPlan[]>([]);

  readonly loading = signal(false);
  readonly activeForm = signal<FormTab>(null);
  readonly submitting = signal(false);
  readonly formError = signal<string | null>(null);
  readonly isGym = computed(() => this.auth.businessType() === 'gym');

  constructor() {
    void this.refresh();
  }

  async refresh(): Promise<void> {
    this.loading.set(true);
    try {
      const tasks: Promise<unknown>[] = [
        this.saleQuery.listSales().then((v) => this.sales.set(v)),
        this.productQuery.listProducts().then((v) => this.products.set(v)),
        this.clientQuery.listClients().then((v) => this.clients.set(v)),
      ];
      if (this.isGym()) {
        tasks.push(this.planQuery.listPlans().then((v) => this.plans.set(v)));
      }
      await Promise.all(tasks);
    } catch (err: unknown) {
      console.error('Error cargando ventas', err);
    } finally {
      this.loading.set(false);
    }
  }

  openForm(tab: Exclude<FormTab, null>): void {
    this.activeForm.set(tab);
    this.formError.set(null);
  }

  closeForm(): void {
    this.activeForm.set(null);
    this.formError.set(null);
  }

  async handleSaleProduct(input: RegisterSaleProductInput): Promise<void> {
    this.submitting.set(true);
    this.formError.set(null);
    try {
      await this.saleService.registerSaleProduct(input);
      this.activeForm.set(null);
      await this.refresh();
    } catch (err: unknown) {
      this.formError.set(err instanceof Error ? err.message : 'Error al registrar venta');
    } finally {
      this.submitting.set(false);
    }
  }

  async handleSaleMembership(input: RegisterSaleMembershipInput): Promise<void> {
    this.submitting.set(true);
    this.formError.set(null);
    try {
      await this.saleService.registerSaleMembership(input);
      this.activeForm.set(null);
      await this.refresh();
    } catch (err: unknown) {
      this.formError.set(err instanceof Error ? err.message : 'Error al registrar membresía');
    } finally {
      this.submitting.set(false);
    }
  }
}
