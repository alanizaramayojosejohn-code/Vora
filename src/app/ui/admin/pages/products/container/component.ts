import { ChangeDetectionStrategy, Component, computed, inject, signal } from '@angular/core';
import { Category } from '../../../../../models/category.model';
import { Product } from '../../../../../models/product.model';
import { CategoryQueryService } from '../../../../../services/category/query.service';
import { ProductService } from '../../../../../services/product/product.service';
import { ProductQueryService } from '../../../../../services/product/query.service';
import { errorMessage } from '../../../../../utilities/error-message';
import { ConfirmDeleteModalComponent } from '../../../../shared/confirm-delete-modal.component';
import { FormModalComponent } from '../../../../shared/form-modal.component';
import { ReadonlyDisabledDirective } from '../../../../shared/readonly-disabled.directive';
import { ProductFormValue, ProductsFormComponent } from '../components/form/form';
import { ProductsListComponent } from '../components/list/list';

@Component({
  selector: 'app-admin-products',
  imports: [FormModalComponent, ProductsListComponent, ProductsFormComponent, ConfirmDeleteModalComponent, ReadonlyDisabledDirective],
  templateUrl: './component.html',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class AdminProductsContainerComponent {
  private readonly productService = inject(ProductService);
  private readonly productQuery = inject(ProductQueryService);
  private readonly categoryQuery = inject(CategoryQueryService);

  readonly products = signal<Product[]>([]);
  readonly categories = signal<Category[]>([]);
  readonly loading = signal(false);

  readonly formState = signal<null | 'create' | Product>(null);
  readonly editing = computed<Product | null>(() => {
    const s = this.formState();
    return s && s !== 'create' ? s : null;
  });
  readonly showForm = computed(() => this.formState() !== null);

  readonly submitting = signal(false);
  readonly formError = signal<string | null>(null);
  // Aviso de nivel página: el producto se guardó pero su imagen no.
  readonly imageNotice = signal<string | null>(null);

  // Soft delete via modal — los productos no requieren type-to-confirm porque
  // queda en deleted_at, las ventas históricas siguen viendolo.
  readonly deleting = signal<Product | null>(null);
  readonly deletingError = signal<string | null>(null);
  readonly deletingSubmitting = signal(false);

  readonly deletingInitials = computed(() => {
    const p = this.deleting();
    if (!p) return null;
    const parts = p.name.trim().split(/\s+/).filter(Boolean);
    if (parts.length === 0) return null;
    if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
    return (parts[0][0] + parts[1][0]).toUpperCase();
  });

  // Precio formateado como string para el slot "amount" del modal.
  readonly deletingPrice = computed(() => {
    const p = this.deleting();
    if (!p) return null;
    return `Bs ${Number(p.price).toFixed(2)}`;
  });

  readonly deletingSublabel = computed(() => {
    const p = this.deleting();
    if (!p) return null;
    const cat = p.category?.name ?? 'Sin categoría';
    return `${cat} · Stock ${p.stock}`;
  });

  constructor() {
    void this.refresh();
    void this.loadCategories();
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

  async loadCategories(): Promise<void> {
    try {
      this.categories.set(await this.categoryQuery.listCategories());
    } catch (err: unknown) {
      console.error('Error listando categorías', err);
    }
  }

  openCreate(): void {
    this.formState.set('create');
    this.formError.set(null);
  }

  openEdit(product: Product): void {
    this.formState.set(product);
    this.formError.set(null);
  }

  closeForm(): void {
    this.formState.set(null);
    this.formError.set(null);
  }

  async handleSubmit(value: ProductFormValue): Promise<void> {
    this.submitting.set(true);
    this.formError.set(null);
    this.imageNotice.set(null);
    const editing = this.editing();

    let saved: Product;
    try {
      saved = editing
        ? await this.productService.updateProduct(editing.id, value.product)
        : await this.productService.createProduct(value.product);
    } catch (err: unknown) {
      this.formError.set(
        errorMessage(err, editing ? 'Error al guardar producto' : 'Error al crear producto'),
      );
      this.submitting.set(false);
      return;
    }

    // La imagen va después, porque la ruta del archivo necesita el id del
    // producto. Si falla, el producto YA está guardado: reabrir el formulario
    // con el error haría que un alta se reenvíe y se duplique. Se cierra, se
    // refresca y el aviso queda arriba de la lista.
    try {
      await this.applyImage(saved.id, value);
    } catch (err: unknown) {
      this.imageNotice.set(
        `El producto "${saved.name}" se guardó, pero la imagen no: ${errorMessage(err, 'error desconocido')}. Editalo para reintentar.`,
      );
    }

    this.formState.set(null);
    this.submitting.set(false);
    await this.refresh();
  }

  private async applyImage(productId: string, value: ProductFormValue): Promise<void> {
    if (value.imageFile) {
      const url = await this.productService.uploadImage(value.imageFile, productId);
      await this.productService.setImageUrl(productId, url);
      return;
    }
    if (value.removeImage) {
      await this.productService.removeImage(productId);
      await this.productService.setImageUrl(productId, null);
    }
  }

  dismissImageNotice(): void {
    this.imageNotice.set(null);
  }

  handleDelete(product: Product): void {
    this.deleting.set(product);
    this.deletingError.set(null);
  }

  cancelDelete(): void {
    if (this.deletingSubmitting()) return;
    this.deleting.set(null);
    this.deletingError.set(null);
  }

  async confirmDelete(): Promise<void> {
    const product = this.deleting();
    if (!product) return;
    this.deletingSubmitting.set(true);
    this.deletingError.set(null);
    try {
      await this.productService.softDeleteProduct(product.id);
      if (this.editing()?.id === product.id) this.formState.set(null);
      this.deleting.set(null);
      await this.refresh();
    } catch (err: unknown) {
      this.deletingError.set(errorMessage(err, 'Error al eliminar producto'));
    } finally {
      this.deletingSubmitting.set(false);
    }
  }
}
