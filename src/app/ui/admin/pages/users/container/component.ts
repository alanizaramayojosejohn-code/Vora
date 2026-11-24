import { ChangeDetectionStrategy, Component, computed, inject } from '@angular/core';
import { Profile } from '../../../../../models/profile.model';
import { ProfileService } from '../../../../../services/profile/profile.service';
import { ProfileQueryService } from '../../../../../services/profile/query.service';
import { ConfirmDeleteModalComponent } from '../../../../shared/confirm-delete-modal.component';
import { createCrudState } from '../../../../shared/crud-state';
import { FormModalComponent } from '../../../../shared/form-modal.component';
import { ReadonlyDisabledDirective } from '../../../../shared/readonly-disabled.directive';
import { UserFormValue, UsersFormComponent } from '../components/form/form';
import { UsersListComponent } from '../components/list/list';

@Component({
  selector: 'app-admin-users',
  imports: [FormModalComponent, UsersListComponent, UsersFormComponent, ConfirmDeleteModalComponent, ReadonlyDisabledDirective],
  templateUrl: './component.html',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class AdminUsersContainerComponent {
  private readonly profileService = inject(ProfileService);
  private readonly profileQuery = inject(ProfileQueryService);

  private readonly crud = createCrudState<Profile, UserFormValue>({
    list: () => this.profileQuery.listBusinessUsers(),
    create: (input) => this.profileService.createUserForBusiness({
      email: input.email,
      password: input.password,
      name: input.name,
      ci: input.ci,
      role: input.role,
    }),
    update: (id, input) => this.profileService.updateProfile(id, {
      name: input.name,
      ci: input.ci,
      role: input.role,
    }),
    remove: (id) => this.profileService.deleteProfile(id),
    labels: {
      load: 'Error al listar usuarios',
      create: 'Error al crear usuario',
      update: 'Error al guardar usuario',
      remove: 'Error al borrar usuario',
    },
  });

  readonly users = this.crud.items;
  readonly loading = this.crud.loading;
  readonly loadError = this.crud.loadError;

  readonly formState = this.crud.formState;
  readonly editing = this.crud.editing;
  readonly showForm = this.crud.showForm;
  readonly submitting = this.crud.submitting;
  readonly formError = this.crud.formError;

  // Modal de borrado. Type-to-confirm porque elimina acceso al panel.
  readonly deleting = this.crud.deleting;
  readonly deletingError = this.crud.deletingError;
  readonly deletingSubmitting = this.crud.deletingSubmitting;
  readonly deletingInitials = this.crud.deletingInitials;

  readonly deletingSublabel = computed(() => {
    const u = this.deleting();
    if (!u) return null;
    const role = u.role === 'admin' ? 'Administrador' : u.role === 'caja' ? 'Cajero' : 'Super admin';
    return `${role} · CI ${u.ci}`;
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
