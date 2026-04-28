import { ChangeDetectionStrategy, Component, inject, signal } from '@angular/core';
import { Client } from '../../../../../models/client.model';
import { ClientService, CreateClientInput } from '../../../../../services/client/client.service';
import { ClientQueryService } from '../../../../../services/client/query.service';
import { ClientsFormComponent } from '../components/form/form';
import { ClientsListComponent } from '../components/list/list';

@Component({
  selector: 'app-admin-clients',
  imports: [ClientsListComponent, ClientsFormComponent],
  templateUrl: './component.html',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class AdminClientsContainerComponent {
  private readonly clientService = inject(ClientService);
  private readonly clientQuery = inject(ClientQueryService);

  readonly clients = signal<Client[]>([]);
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
      this.clients.set(await this.clientQuery.listClients());
    } catch (err: unknown) {
      console.error('Error listando clientes', err);
    } finally {
      this.loading.set(false);
    }
  }

  toggleForm(): void {
    this.showForm.update((v) => !v);
    this.formError.set(null);
  }

  async handleSubmit(input: CreateClientInput): Promise<void> {
    this.submitting.set(true);
    this.formError.set(null);
    try {
      await this.clientService.createClient(input);
      this.showForm.set(false);
      await this.refresh();
    } catch (err: unknown) {
      this.formError.set(err instanceof Error ? err.message : 'Error al crear cliente');
    } finally {
      this.submitting.set(false);
    }
  }
}
