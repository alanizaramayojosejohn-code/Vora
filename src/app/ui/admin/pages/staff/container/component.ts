import { DatePipe } from '@angular/common';
import { ChangeDetectionStrategy, Component, inject, signal } from '@angular/core';
import { Employee, SalaryPayment } from '../../../../../models/employee.model';
import { CreateEmployeeInput, CreatePaymentInput, StaffService } from '../../../../../services/staff/staff.service';
import { errorMessage } from '../../../../../utilities/error-message';
import { ConfirmDeleteModalComponent } from '../../../../shared/confirm-delete-modal.component';
import { createCrudState } from '../../../../shared/crud-state';
import { FormModalComponent } from '../../../../shared/form-modal.component';
import { ReadonlyDisabledDirective } from '../../../../shared/readonly-disabled.directive';
import { StaffFormComponent } from '../components/form/form';
import { StaffListComponent } from '../components/list/list';
import { StaffPaymentFormComponent } from '../components/payment-form/payment-form';
import { PaymentsHistoryComponent } from '../components/payments-history/payments-history';

@Component({
  selector: 'app-admin-staff',
  imports: [FormModalComponent,
    DatePipe,
    StaffListComponent,
    StaffFormComponent,
    StaffPaymentFormComponent,
    PaymentsHistoryComponent,
    ConfirmDeleteModalComponent,
    ReadonlyDisabledDirective,
  ],
  templateUrl: './component.html',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class AdminStaffContainerComponent {
  private readonly staffService = inject(StaffService);

  // Panel de pagos — no encaja en el CRUD genérico: no tiene modo "editar" y
  // create/delete quedan en el propio negocio de sueldos, no en la entidad
  // Employee. Se queda íntegro en el contenedor.
  readonly selectedEmployee = signal<Employee | null>(null);
  readonly payments = signal<SalaryPayment[]>([]);
  readonly paymentsLoading = signal(false);
  readonly showPaymentForm = signal(false);
  readonly paymentSubmitting = signal(false);
  readonly paymentError = signal<string | null>(null);
  readonly deletingPayment = signal<SalaryPayment | null>(null);
  readonly deletingPaymentSubmitting = signal(false);
  readonly deletingPaymentError = signal<string | null>(null);

  private readonly crud = createCrudState<Employee, CreateEmployeeInput>({
    list: () => this.staffService.listEmployees(),
    create: (input) => this.staffService.createEmployee(input),
    update: (id, input) => this.staffService.updateEmployee(id, input),
    remove: (id) => this.staffService.deleteEmployee(id),
    labels: {
      load: 'Error al listar empleados',
      create: 'Error al crear empleado',
      update: 'Error al guardar empleado',
      remove: 'Error al eliminar empleado',
    },
    // Si el empleado borrado tenía el panel de pagos abierto, hay que cerrarlo:
    // ya no hay a quién mostrarle pagos.
    onRemoved: (emp) => {
      if (this.selectedEmployee()?.id === emp.id) this.selectedEmployee.set(null);
    },
  });

  readonly employees = this.crud.items;
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

  async openPayments(emp: Employee): Promise<void> {
    this.selectedEmployee.set(emp);
    this.showPaymentForm.set(false);
    this.paymentsLoading.set(true);
    try {
      this.payments.set(await this.staffService.listPayments(emp.id));
    } catch (err: unknown) {
      console.error('Error cargando pagos', err);
    } finally {
      this.paymentsLoading.set(false);
    }
  }

  closePayments(): void {
    this.selectedEmployee.set(null);
    this.payments.set([]);
    this.showPaymentForm.set(false);
  }

  async handlePayment(input: CreatePaymentInput): Promise<void> {
    this.paymentSubmitting.set(true);
    this.paymentError.set(null);
    try {
      await this.staffService.createPayment(input);
      this.showPaymentForm.set(false);
      const emp = this.selectedEmployee();
      if (emp) this.payments.set(await this.staffService.listPayments(emp.id));
    } catch (err: unknown) {
      this.paymentError.set(errorMessage(err, 'Error al registrar pago'));
    } finally {
      this.paymentSubmitting.set(false);
    }
  }

  handleDeletePayment(p: SalaryPayment): void {
    this.deletingPayment.set(p);
    this.deletingPaymentError.set(null);
  }

  cancelDeletePayment(): void {
    if (this.deletingPaymentSubmitting()) return;
    this.deletingPayment.set(null);
    this.deletingPaymentError.set(null);
  }

  async confirmDeletePayment(): Promise<void> {
    const p = this.deletingPayment();
    if (!p) return;
    this.deletingPaymentSubmitting.set(true);
    this.deletingPaymentError.set(null);
    try {
      await this.staffService.deletePayment(p.id);
      this.deletingPayment.set(null);
      const emp = this.selectedEmployee();
      if (emp) this.payments.set(await this.staffService.listPayments(emp.id));
    } catch (err: unknown) {
      this.deletingPaymentError.set(errorMessage(err, 'Error al eliminar pago'));
    } finally {
      this.deletingPaymentSubmitting.set(false);
    }
  }
}
