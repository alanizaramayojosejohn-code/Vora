import { DatePipe } from '@angular/common';
import { ChangeDetectionStrategy, Component, computed, inject, signal } from '@angular/core';
import { Employee, SalaryPayment } from '../../../../../models/employee.model';
import { CreateEmployeeInput, CreatePaymentInput, StaffService } from '../../../../../services/staff/staff.service';
import { errorMessage } from '../../../../../utilities/error-message';
import { ConfirmDeleteModalComponent } from '../../../../shared/confirm-delete-modal.component';
import { StaffFormComponent } from '../components/form/form';
import { StaffListComponent } from '../components/list/list';
import { StaffPaymentFormComponent } from '../components/payment-form/payment-form';
import { PaymentsHistoryComponent } from '../components/payments-history/payments-history';

@Component({
  selector: 'app-admin-staff',
  imports: [
    DatePipe,
    StaffListComponent,
    StaffFormComponent,
    StaffPaymentFormComponent,
    PaymentsHistoryComponent,
    ConfirmDeleteModalComponent,
  ],
  templateUrl: './component.html',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class AdminStaffContainerComponent {
  private readonly staffService = inject(StaffService);

  readonly employees = signal<Employee[]>([]);
  readonly loading = signal(false);

  readonly formState = signal<null | 'create' | Employee>(null);
  readonly editing = computed<Employee | null>(() => {
    const s = this.formState();
    return s && s !== 'create' ? s : null;
  });
  readonly showForm = computed(() => this.formState() !== null);

  readonly submitting = signal(false);
  readonly formError = signal<string | null>(null);

  // Borrado de empleado
  readonly deleting = signal<Employee | null>(null);
  readonly deletingError = signal<string | null>(null);
  readonly deletingSubmitting = signal(false);
  readonly deletingInitials = computed(() => {
    const e = this.deleting();
    if (!e) return null;
    const parts = e.name.trim().split(/\s+/).filter(Boolean);
    if (parts.length === 0) return null;
    if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
    return (parts[0][0] + parts[1][0]).toUpperCase();
  });

  // Panel de pagos
  readonly selectedEmployee = signal<Employee | null>(null);
  readonly payments = signal<SalaryPayment[]>([]);
  readonly paymentsLoading = signal(false);
  readonly showPaymentForm = signal(false);
  readonly paymentSubmitting = signal(false);
  readonly paymentError = signal<string | null>(null);
  readonly deletingPayment = signal<SalaryPayment | null>(null);
  readonly deletingPaymentSubmitting = signal(false);
  readonly deletingPaymentError = signal<string | null>(null);

  constructor() {
    void this.refresh();
  }

  async refresh(): Promise<void> {
    this.loading.set(true);
    try {
      this.employees.set(await this.staffService.listEmployees());
    } catch (err: unknown) {
      console.error('Error cargando empleados', err);
    } finally {
      this.loading.set(false);
    }
  }

  openCreate(): void {
    this.formState.set('create');
    this.formError.set(null);
  }

  openEdit(emp: Employee): void {
    this.formState.set(emp);
    this.formError.set(null);
  }

  closeForm(): void {
    this.formState.set(null);
    this.formError.set(null);
  }

  async handleSubmit(input: CreateEmployeeInput): Promise<void> {
    this.submitting.set(true);
    this.formError.set(null);
    const editing = this.editing();
    try {
      if (editing) {
        await this.staffService.updateEmployee(editing.id, input);
      } else {
        await this.staffService.createEmployee(input);
      }
      this.formState.set(null);
      await this.refresh();
    } catch (err: unknown) {
      this.formError.set(errorMessage(err, editing ? 'Error al guardar empleado' : 'Error al crear empleado'));
    } finally {
      this.submitting.set(false);
    }
  }

  handleDelete(emp: Employee): void {
    this.deleting.set(emp);
    this.deletingError.set(null);
  }

  cancelDelete(): void {
    if (this.deletingSubmitting()) return;
    this.deleting.set(null);
    this.deletingError.set(null);
  }

  async confirmDelete(): Promise<void> {
    const emp = this.deleting();
    if (!emp) return;
    this.deletingSubmitting.set(true);
    this.deletingError.set(null);
    try {
      await this.staffService.deleteEmployee(emp.id);
      if (this.selectedEmployee()?.id === emp.id) this.selectedEmployee.set(null);
      this.deleting.set(null);
      await this.refresh();
    } catch (err: unknown) {
      this.deletingError.set(errorMessage(err, 'Error al eliminar empleado'));
    } finally {
      this.deletingSubmitting.set(false);
    }
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
