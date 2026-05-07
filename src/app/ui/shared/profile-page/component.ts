import { ChangeDetectionStrategy, Component, computed, inject, signal } from '@angular/core';
import { AbstractControl, FormBuilder, ReactiveFormsModule, ValidationErrors, Validators } from '@angular/forms';
import { AuthService } from '../../../services/auth/auth.service';
import { errorMessage } from '../../../utilities/error-message';

function passwordsMatchValidator(group: AbstractControl): ValidationErrors | null {
  const newPw = group.get('newPassword')?.value;
  const confirm = group.get('confirmPassword')?.value;
  return newPw && confirm && newPw !== confirm ? { passwordsMismatch: true } : null;
}

@Component({
  selector: 'app-profile-page',
  imports: [ReactiveFormsModule],
  templateUrl: './component.html',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class ProfilePageComponent {
  private readonly fb = inject(FormBuilder);
  protected readonly auth = inject(AuthService);

  readonly email = computed(() => this.auth.session()?.user.email ?? '—');
  readonly name = computed(() => this.auth.profile()?.name ?? '');
  readonly ci = computed(() => this.auth.profile()?.ci ?? '—');
  readonly joinedAt = computed(() => {
    const d = this.auth.profile()?.created_at;
    if (!d) return '—';
    return new Date(d).toLocaleDateString('es-BO', { year: 'numeric', month: 'long', day: 'numeric' });
  });
  readonly roleLabel = computed(() => {
    const r = this.auth.profile()?.role;
    if (r === 'super_admin') return 'Super Admin';
    if (r === 'admin') return 'Administrador';
    if (r === 'caja') return 'Cajero';
    return r ?? '—';
  });
  readonly initials = computed(() => {
    const n = this.name().trim();
    if (!n) return '··';
    const parts = n.split(/\s+/).filter(Boolean);
    if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
    return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
  });

  // Sólo usuarios con proveedor email pueden cambiar contraseña desde aquí.
  // Los que usan Google gestionan su contraseña en cuentas de Google.
  readonly isEmailProvider = computed(() =>
    (this.auth.session()?.user.identities ?? []).some((i) => i.provider === 'email'),
  );

  readonly pwForm = this.fb.nonNullable.group(
    {
      currentPassword: ['', [Validators.required]],
      newPassword: ['', [Validators.required, Validators.minLength(6)]],
      confirmPassword: ['', [Validators.required]],
    },
    { validators: passwordsMatchValidator },
  );

  readonly pwSubmitting = signal(false);
  readonly pwError = signal<string | null>(null);
  readonly pwSuccess = signal(false);

  clearFeedback(): void {
    this.pwError.set(null);
    this.pwSuccess.set(false);
  }

  async changePassword(): Promise<void> {
    if (this.pwForm.invalid || this.pwSubmitting()) return;
    const { currentPassword, newPassword } = this.pwForm.getRawValue();
    this.pwSubmitting.set(true);
    this.pwError.set(null);
    this.pwSuccess.set(false);
    try {
      await this.auth.updatePassword(currentPassword, newPassword);
      this.pwSuccess.set(true);
      this.pwForm.reset();
    } catch (err: unknown) {
      this.pwError.set(errorMessage(err, 'Error al cambiar la contraseña'));
    } finally {
      this.pwSubmitting.set(false);
    }
  }
}
