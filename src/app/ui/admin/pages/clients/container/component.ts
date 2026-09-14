import { ChangeDetectionStrategy, Component, inject } from '@angular/core';
import { Client } from '../../../../../models/client.model';
import { ClientService, CreateClientInput } from '../../../../../services/client/client.service';
import { ClientQueryService } from '../../../../../services/client/query.service';
import { ConfirmDeleteModalComponent } from '../../../../shared/confirm-delete-modal.component';
import { createCrudState } from '../../../../shared/crud-state';
import { FormModalComponent } from '../../../../shared/form-modal.component';
import { ReadonlyDisabledDirective } from '../../../../shared/readonly-disabled.directive';
import { ClientsFormComponent } from '../components/form/form';
import { ClientsListComponent } from '../components/list/list';

@Component({
  selector: 'app-admin-clients',
  imports: [FormModalComponent, ClientsListComponent, ClientsFormComponent, ConfirmDeleteModalComponent, ReadonlyDisabledDirective],
  templateUrl: './component.html',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class AdminClientsContainerComponent {
  private readonly clientService = inject(ClientService);
  private readonly clientQuery = inject(ClientQueryService);

  private readonly crud = createCrudState<Client, CreateClientInput>({
    list: () => this.clientQuery.listClients(),
    create: (input) => this.clientService.createClient(input),
    update: (id, input) => this.clientService.updateClient(id, input),
    remove: (id) => this.clientService.deleteClient(id),
    labels: {
      load: 'Error al listar clientes',
      create: 'Error al crear cliente',
      update: 'Error al guardar cliente',
      remove: 'Error al borrar cliente',
    },
  });

  readonly clients = this.crud.items;
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
