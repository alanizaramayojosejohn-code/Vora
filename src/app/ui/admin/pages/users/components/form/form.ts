import { ChangeDetectionStrategy, Component, inject, input, output } from '@angular/core';
import { FormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { CreateUserForBusinessInput } from '../../../../../../services/profile/profile.service';

const UUID_REGEX = /^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$/;

@Component({
  selector: 'app-admin-users-form',
  imports: [ReactiveFormsModule],
  templateUrl: './form.html',
  styleUrl: './form.css',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class UsersFormComponent {
  private readonly fb = inject(FormBuilder);

  readonly submitting = input<boolean>(false);
  readonly errorMessage = input<string | null>(null);
  readonly submitForm = output<CreateUserForBusinessInput>();
  readonly cancel = output<void>();

  readonly form = this.fb.nonNullable.group({
    user_id: ['', [Validators.required, Validators.pattern(UUID_REGEX)]],
    name: ['', [Validators.required, Validators.minLength(2)]],
    ci: ['', [Validators.required]],
    role: ['caja' as 'admin' | 'caja', [Validators.required]],
  });

  onSubmit(): void {
    if (this.form.invalid || this.submitting()) return;
    const raw = this.form.getRawValue();
    this.submitForm.emit({
      user_id: raw.user_id.trim(),
      name: raw.name.trim(),
      ci: raw.ci.trim(),
      role: raw.role,
    });
  }
}
