import { ChangeDetectionStrategy, Component, inject, signal } from '@angular/core';
import { Product } from '../../../../../models/product.model';
import { CreateProductInput, ProductService } from '../../../../../services/product/product.service';
import { ProductQueryService } from '../../../../../services/product/query.service';
import { ProductsFormComponent } from '../components/form/form';
import { ProductsListComponent } from '../components/list/list';

@Component({
  selector: 'app-admin-products',
  imports: [ProductsListComponent, ProductsFormComponent],
  templateUrl: './component.html',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class AdminProductsContainerComponent {
  private readonly productService = inject(ProductService);
  private readonly productQuery = inject(ProductQueryService);

  readonly products = signal<Product[]>([]);
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
      this.products.set(await this.productQuery.listProducts());
    } catch (err: unknown) {
      console.error('Error listando productos', err);
    } finally {
      this.loading.set(false);
    }
  }

  toggleForm(): void {
    this.showForm.update((v) => !v);
    this.formError.set(null);
  }

  async handleSubmit(input: CreateProductInput): Promise<void> {
    this.submitting.set(true);
    this.formError.set(null);
    try {
      await this.productService.createProduct(input);
      this.showForm.set(false);
      await this.refresh();
    } catch (err: unknown) {
      this.formError.set(err instanceof Error ? err.message : 'Error al crear producto');
    } finally {
      this.submitting.set(false);
    }
  }
}
