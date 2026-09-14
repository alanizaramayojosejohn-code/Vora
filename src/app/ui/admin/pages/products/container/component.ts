import { ChangeDetectionStrategy, Component, computed, inject, signal } from '@angular/core';
import { Category } from '../../../../../models/category.model';
import { Product } from '../../../../../models/product.model';
import { CategoryQueryService } from '../../../../../services/category/query.service';
import { ProductService } from '../../../../../services/product/product.service';
import { ProductQueryService } from '../../../../../services/product/query.service';
import { errorMessage } from '../../../../../utilities/error-message';
import { ConfirmDeleteModalComponent } from '../../../../shared/confirm-delete-modal.component';
import { createCrudState } from '../../../../shared/crud-state';
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

  // Categorías para el <select> del form. Se cargan aparte porque son un
  // recurso distinto (no participan del CRUD de productos) y su fallo no
  // debe tapar el listado de productos — por eso sigue en console.error.
  readonly categories = signal<Category[]>([]);

  // No entra en el CRUD genérico: handleSubmit de productos necesita el id
  // devuelto por create/update para subir la imagen después, y un fallo de
  // imagen no debe tratarse como error de formulario (el producto ya quedó
  // guardado). Por eso config no lleva create/update: este contenedor arma
  // su propio handleSubmit reutilizando los signals de abajo.
  private readonly crud = createCrudState<Product, never>({
    list: () => this.productQuery.listProducts(),
    remove: (id) => this.productService.softDeleteProduct(id),
    labels: {
      load: 'Error al listar productos',
      remove: 'Error al eliminar producto',
    },
  });

  readonly products = this.crud.items;
  readonly loading = this.crud.loading;
  readonly loadError = this.crud.loadError;

  readonly formState = this.crud.formState;
  readonly editing = this.crud.editing;
  readonly showForm = this.crud.showForm;

  readonly submitting = this.crud.submitting;
  readonly formError = this.crud.formError;
  // Aviso de nivel página: el producto se guardó pero su imagen no.
  readonly imageNotice = signal<string | null>(null);

  readonly deleting = this.crud.deleting;
  readonly deletingError = this.crud.deletingError;
  readonly deletingSubmitting = this.crud.deletingSubmitting;
  readonly deletingInitials = this.crud.deletingInitials;

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

  readonly refresh = this.crud.refresh;
  readonly openCreate = this.crud.openCreate;
  readonly openEdit = this.crud.openEdit;
  readonly closeForm = this.crud.closeForm;
  readonly handleDelete = this.crud.handleDelete;
  readonly cancelDelete = this.crud.cancelDelete;
  readonly confirmDelete = this.crud.confirmDelete;

  constructor() {
    void this.refresh();
    void this.loadCategories();
  }

  async loadCategories(): Promise<void> {
    try {
      this.categories.set(await this.categoryQuery.listCategories());
    } catch (err: unknown) {
      console.error('Error listando categorías', err);
    }
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
}
