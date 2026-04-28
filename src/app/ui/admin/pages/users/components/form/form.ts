import { ChangeDetectionStrategy, Component, computed, effect, inject, input, output } from '@angular/core';
import { FormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { Profile, UserRole } from '../../../../../../models/profile.model';

const UUID_REGEX = /^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$/;

// Shape unificado que emite el form. user_id solo se usa en modo create.
export interface UserFormValue {
  user_id: string;
  name: string;
  ci: string;
  role: Extract<UserRole, 'admin' | 'caja'>;
}

@Component({
  selector: 'app-admin-users-form',
  imports: [ReactiveFormsModule],
  templateUrl: './form.html',
  styleUrl: './form.css',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class UsersFormComponent {
  private readonly fb = inject(FormBuilder);

  readonly value = input<Profile | null>(null);
  readonly submitting = input<boolean>(false);
  readonly errorMessage = input<string | null>(null);
  readonly submitForm = output<UserFormValue>();
  readonly cancel = output<void>();

  readonly isEdit = computed(() => this.value() !== null);

  readonly form = this.fb.nonNullable.group({
    user_id: ['', [Validators.required, Validators.pattern(UUID_REGEX)]],
    name: ['', [Validators.required, Validators.minLength(2)]],
    ci: ['', [Validators.required]],
    role: ['caja' as 'admin' | 'caja', [Validators.required]],
  });

  constructor() {
    effect(() => {
      const v = this.value();
      if (v) {
        // En edit no editamos user_id; lo deshabilitamos para que el form siga válido sin pattern.
        this.form.controls.user_id.disable({ emitEvent: false });
        // role en super_admin no debería aparecer en este form (los super_admin no van por business),
        // pero por las dudas lo coercemos a 'caja' para que el typed control no rompa.
        const role: 'admin' | 'caja' = v.role === 'admin' ? 'admin' : 'caja';
        this.form.reset({ user_id: '', name: v.name, ci: v.ci, role });
      } else {
        this.form.controls.user_id.enable({ emitEvent: false });
        this.form.reset({ user_id: '', name: '', ci: '', role: 'caja' });
      }
    });
  }

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
