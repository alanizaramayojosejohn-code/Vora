import { ChangeDetectionStrategy, Component, inject, signal } from '@angular/core';
import { Profile } from '../../../../../models/profile.model';
import { CreateUserForBusinessInput, ProfileService } from '../../../../../services/profile/profile.service';
import { ProfileQueryService } from '../../../../../services/profile/query.service';
import { UsersFormComponent } from '../components/form/form';
import { UsersListComponent } from '../components/list/list';

@Component({
  selector: 'app-admin-users',
  imports: [UsersListComponent, UsersFormComponent],
  templateUrl: './component.html',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class AdminUsersContainerComponent {
  private readonly profileService = inject(ProfileService);
  private readonly profileQuery = inject(ProfileQueryService);

  readonly users = signal<Profile[]>([]);
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
      this.users.set(await this.profileQuery.listBusinessUsers());
    } catch (err: unknown) {
      console.error('Error listando usuarios', err);
    } finally {
      this.loading.set(false);
    }
  }

  toggleForm(): void {
    this.showForm.update((v) => !v);
    this.formError.set(null);
  }

  async handleSubmit(input: CreateUserForBusinessInput): Promise<void> {
    this.submitting.set(true);
    this.formError.set(null);
    try {
      await this.profileService.createUserForBusiness(input);
      this.showForm.set(false);
      await this.refresh();
    } catch (err: unknown) {
      this.formError.set(err instanceof Error ? err.message : 'Error al crear usuario');
    } finally {
      this.submitting.set(false);
    }
  }
}
