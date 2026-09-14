import { ChangeDetectionStrategy, Component, inject } from '@angular/core';
import { FormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { RouterLink } from '@angular/router';
import { Supplier } from '../../../../../models/supplier.model';
import { SupplierInput, SupplierService } from '../../../../../services/supplier/supplier.service';
import { ConfirmDeleteModalComponent } from '../../../../shared/confirm-delete-modal.component';
import { createCrudState } from '../../../../shared/crud-state';
import { ReadonlyDisabledDirective } from '../../../../shared/readonly-disabled.directive';

@Component({
  selector: 'app-purchases-suppliers',
  imports: [ReactiveFormsModule, RouterLink, ConfirmDeleteModalComponent, ReadonlyDisabledDirective],
  templateUrl: './component.html',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class PurchasesSuppliersComponent {
  private readonly supplierService = inject(SupplierService);
  private readonly fb = inject(FormBuilder);

  private readonly crud = createCrudState<Supplier, SupplierInput>({
    list: () => this.supplierService.listSuppliers(),
    create: (input) => this.supplierService.createSupplier(input),
    update: (id, input) => this.supplierService.updateSupplier(id, input),
    remove: (id) => this.supplierService.deleteSupplier(id),
    labels: {
      load: 'Error al listar proveedores',
      // El form original no distingue mensaje entre crear y editar.
      create: 'Error al guardar proveedor',
      update: 'Error al guardar proveedor',
      remove: 'Error al eliminar proveedor',
    },
  });

  readonly suppliers = this.crud.items;
  readonly loading = this.crud.loading;
  readonly loadError = this.crud.loadError;

  readonly formState = this.crud.formState;
  readonly editing = this.crud.editing;
  readonly showForm = this.crud.showForm;
  readonly submitting = this.crud.submitting;
  readonly formError = this.crud.formError;

  readonly deleting = this.crud.deleting;
  readonly deletingSubmitting = this.crud.deletingSubmitting;
  readonly deletingError = this.crud.deletingError;
  readonly deletingInitials = this.crud.deletingInitials;

  readonly form = this.fb.nonNullable.group({
    name:    ['', [Validators.required, Validators.minLength(2)]],
    contact: [''],
    phone:   [''],
    email:   ['', [Validators.email]],
    notes:   [''],
  });

  readonly refresh = this.crud.refresh;
  readonly closeForm = this.crud.closeForm;
  readonly handleDelete = this.crud.handleDelete;
  readonly cancelDelete = this.crud.cancelDelete;
  readonly confirmDelete = this.crud.confirmDelete;

  constructor() {
    void this.refresh();
  }

  private nullIfEmpty(v: string): string | null {
    return v.trim() || null;
  }

  // openCreate/openEdit no son simples alias: además de abrir el form
  // genérico, tienen que sincronizar el FormGroup reactivo (este contenedor,
  // a diferencia de los otros 7, no usa un componente de formulario aparte).
  openCreate(): void {
    this.form.reset({ name: '', contact: '', phone: '', email: '', notes: '' });
    this.crud.openCreate();
  }

  openEdit(s: Supplier): void {
    this.form.reset({
      name:    s.name,
      contact: s.contact ?? '',
      phone:   s.phone ?? '',
      email:   s.email ?? '',
      notes:   s.notes ?? '',
    });
    this.crud.openEdit(s);
  }

  async onSubmit(): Promise<void> {
    if (this.form.invalid || this.submitting()) return;
    const raw = this.form.getRawValue();
    await this.crud.handleSubmit({
      name:    raw.name.trim(),
      contact: this.nullIfEmpty(raw.contact),
      phone:   this.nullIfEmpty(raw.phone),
      email:   this.nullIfEmpty(raw.email),
      notes:   this.nullIfEmpty(raw.notes),
    });
  }
}
