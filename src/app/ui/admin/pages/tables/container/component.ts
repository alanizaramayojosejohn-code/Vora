import { ChangeDetectionStrategy, Component, computed, inject, signal } from '@angular/core';
import { Table } from '../../../../../models/table.model';
import { OrderQueryService } from '../../../../../services/order/query.service';
import { CreateTableInput, TableService } from '../../../../../services/table/table.service';
import { TableQueryService } from '../../../../../services/table/query.service';
import { ConfirmDeleteModalComponent } from '../../../../shared/confirm-delete-modal.component';
import { createCrudState } from '../../../../shared/crud-state';
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

  // No es parte del CRUD genérico: depende de los pedidos pendientes, no de
  // las mesas en sí. Se completa como efecto secundario dentro de `list`
  // (ver abajo) para que quede sincronizado con cada refresh().
  readonly occupiedIds = signal<string[]>([]);

  private readonly crud = createCrudState<Table, CreateTableInput>({
    list: async () => {
      // Como admin, listPendingOrders(null) trae los pendientes de todo el
      // negocio: son los que dejan una mesa ocupada, sin importar quién los abrió.
      const [tables, pending] = await Promise.all([
        this.tableQuery.listTables(),
        this.orderQuery.listPendingOrders(null),
      ]);
      this.occupiedIds.set(
        pending.map((o) => o.table_id).filter((id): id is string => id !== null),
      );
      return tables;
    },
    create: (input) => this.tableService.createTable(input),
    update: (id, input) => this.tableService.updateTable(id, input),
    remove: (id) => this.tableService.deleteTable(id),
    labels: {
      load: 'Error al listar mesas',
      create: 'Error al crear la mesa',
      update: 'Error al guardar la mesa',
      remove: 'Error al eliminar la mesa',
    },
  });

  readonly tables = this.crud.items;
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

  readonly deletingOccupied = computed(() => {
    const t = this.deleting();
    return t ? this.occupiedIds().includes(t.id) : false;
  });

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
