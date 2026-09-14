import { ChangeDetectionStrategy, Component, inject } from '@angular/core';
import { Category } from '../../../../../models/category.model';
import { CategoryService, CreateCategoryInput } from '../../../../../services/category/category.service';
import { CategoryQueryService } from '../../../../../services/category/query.service';
import { ConfirmDeleteModalComponent } from '../../../../shared/confirm-delete-modal.component';
import { createCrudState } from '../../../../shared/crud-state';
import { FormModalComponent } from '../../../../shared/form-modal.component';
import { ReadonlyDisabledDirective } from '../../../../shared/readonly-disabled.directive';
import { CategoriesFormComponent } from '../components/form/form';
import { CategoriesListComponent } from '../components/list/list';

@Component({
  selector: 'app-admin-categories',
  imports: [CategoriesListComponent, CategoriesFormComponent, ConfirmDeleteModalComponent, FormModalComponent, ReadonlyDisabledDirective],
  templateUrl: './component.html',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class AdminCategoriesContainerComponent {
  private readonly categoryService = inject(CategoryService);
  private readonly categoryQuery = inject(CategoryQueryService);

  private readonly crud = createCrudState<Category, CreateCategoryInput>({
    list: () => this.categoryQuery.listCategories(),
    create: (input) => this.categoryService.createCategory(input),
    update: (id, input) => this.categoryService.updateCategory(id, input),
    remove: (id) => this.categoryService.deleteCategory(id),
    labels: {
      load: 'Error al listar categorías',
      create: 'Error al crear categoría',
      update: 'Error al guardar categoría',
      remove: 'Error al eliminar categoría',
    },
  });

  readonly categories = this.crud.items;
  readonly loading = this.crud.loading;
  readonly loadError = this.crud.loadError;

  readonly formState = this.crud.formState;
  readonly editing = this.crud.editing;
  readonly showForm = this.crud.showForm;
  readonly submitting = this.crud.submitting;
  readonly formError = this.crud.formError;

  readonly deleting = this.crud.deleting;
  readonly deletingError = this.crud.deletingError;
  readonly deletingSubmitting = this.crud.deletingSubmitting;
  readonly deletingInitials = this.crud.deletingInitials;

  readonly refresh = this.crud.refresh;
  readonly openCreate = this.crud.openCreate;
  readonly openEdit = this.crud.openEdit;
  readonly closeForm = this.crud.closeForm;
  readonly handleSubmit = this.crud.handleSubmit;
  readonly handleDelete = this.crud.handleDelete;
  readonly cancelDelete = this.crud.cancelDelete;
  readonly confirmDelete = this.crud.confirmDelete;

  constructor() {
    void this.refresh();
  }
}
