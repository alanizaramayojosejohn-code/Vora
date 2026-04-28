import { ChangeDetectionStrategy, Component, inject, input, output } from '@angular/core';
import { FormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { CreateClientInput } from '../../../../../../services/client/client.service';

@Component({
  selector: 'app-admin-clients-form',
  imports: [ReactiveFormsModule],
  templateUrl: './form.html',
  styleUrl: './form.css',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class ClientsFormComponent {
  private readonly fb = inject(FormBuilder);

  readonly submitting = input<boolean>(false);
  readonly errorMessage = input<string | null>(null);
  readonly submitForm = output<CreateClientInput>();
  readonly cancel = output<void>();

  readonly form = this.fb.nonNullable.group({
    ci: ['', [Validators.required, Validators.minLength(3)]],
    name: ['', [Validators.required, Validators.minLength(2)]],
    phone: [''],
  });

  onSubmit(): void {
    if (this.form.invalid || this.submitting()) return;
    const raw = this.form.getRawValue();
    const phone = raw.phone.trim();
    this.submitForm.emit({
      ci: raw.ci.trim(),
      name: raw.name.trim(),
      phone: phone.length > 0 ? phone : null,
    });
  }
}
