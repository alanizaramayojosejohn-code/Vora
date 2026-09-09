import { ChangeDetectionStrategy, Component, computed, inject, signal } from '@angular/core';
import { Table } from '../../../../../models/table.model';
import { OrderQueryService } from '../../../../../services/order/query.service';
import { CreateTableInput, TableService } from '../../../../../services/table/table.service';
import { TableQueryService } from '../../../../../services/table/query.service';
import { errorMessage } from '../../../../../utilities/error-message';
import { ConfirmDeleteModalComponent } from '../../../../shared/confirm-delete-modal.component';
import { FormModalComponent } from '../../../../shared/form-modal.component';
import { ReadonlyDisabledDirective } from '../../../../shared/readonly-disabled.directive';
import { TablesFormComponent } from '../components/form/form';
import { TablesListComponent } from '../components/list/list';

@Component({
  selector: 'app-admin-tables',
  imports: [TablesListComponent, TablesFormComponent, ConfirmDeleteModalComponent, FormModalComponent, ReadonlyDisabledDirective],
  templateUrl: './component.html',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class AdminTablesContainerComponent {
  private readonly tableService = inject(TableService);
  private readonly tableQuery = inject(TableQueryService);
  private readonly orderQuery = inject(OrderQueryService);

  readonly tables = signal<Table[]>([]);
  readonly occupiedIds = signal<string[]>([]);
  readonly loading = signal(false);

  readonly formState = signal<null | 'create' | Table>(null);
  readonly editing = computed<Table | null>(() => {
    const s = this.formState();
    return s && s !== 'create' ? s : null;
  });
  readonly showForm = computed(() => this.formState() !== null);

  readonly submitting = signal(false);
  readonly formError = signal<string | null>(null);

  readonly deleting = signal<Table | null>(null);
  readonly deletingError = signal<string | null>(null);
  readonly deletingSubmitting = signal(false);

  readonly deletingOccupied = computed(() => {
    const t = this.deleting();
    return t ? this.occupiedIds().includes(t.id) : false;
  });

  constructor() {
    void this.refresh();
  }

  async refresh(): Promise<void> {
    this.loading.set(true);
    try {
      // Como admin, listPendingOrders(null) trae los pendientes de todo el
      // negocio: son los que dejan una mesa ocupada, sin importar quién los abrió.
      const [tables, pending] = await Promise.all([
        this.tableQuery.listTables(),
        this.orderQuery.listPendingOrders(null),
      ]);
      this.tables.set(tables);
      this.occupiedIds.set(
        pending.map((o) => o.table_id).filter((id): id is string => id !== null),
      );
    } catch (err: unknown) {
      console.error('Error listando mesas', err);
    } finally {
      this.loading.set(false);
    }
  }

  openCreate(): void {
    this.formState.set('create');
    this.formError.set(null);
  }

  openEdit(table: Table): void {
    this.formState.set(table);
    this.formError.set(null);
  }

  closeForm(): void {
    this.formState.set(null);
    this.formError.set(null);
  }

  async handleSubmit(input: CreateTableInput): Promise<void> {
    this.submitting.set(true);
    this.formError.set(null);
    const editing = this.editing();
    try {
      if (editing) {
        await this.tableService.updateTable(editing.id, input);
      } else {
        await this.tableService.createTable(input);
      }
      this.formState.set(null);
      await this.refresh();
    } catch (err: unknown) {
      this.formError.set(
        errorMessage(err, editing ? 'Error al guardar la mesa' : 'Error al crear la mesa'),
      );
    } finally {
      this.submitting.set(false);
    }
  }

  handleDelete(table: Table): void {
    this.deleting.set(table);
    this.deletingError.set(null);
  }

  cancelDelete(): void {
    if (this.deletingSubmitting()) return;
    this.deleting.set(null);
    this.deletingError.set(null);
  }

  async confirmDelete(): Promise<void> {
    const table = this.deleting();
    if (!table) return;
    this.deletingSubmitting.set(true);
    this.deletingError.set(null);
    try {
      await this.tableService.deleteTable(table.id);
      if (this.editing()?.id === table.id) this.formState.set(null);
      this.deleting.set(null);
      await this.refresh();
    } catch (err: unknown) {
      this.deletingError.set(errorMessage(err, 'Error al eliminar la mesa'));
    } finally {
      this.deletingSubmitting.set(false);
    }
  }
}
