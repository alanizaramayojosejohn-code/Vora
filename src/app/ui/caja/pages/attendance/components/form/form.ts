import { ChangeDetectionStrategy, Component, computed, inject, input, output, signal } from '@angular/core';
import { FormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { Client } from '../../../../../../models/client.model';

@Component({
  selector: 'app-caja-attendance-form',
  imports: [ReactiveFormsModule],
  templateUrl: './form.html',
  styleUrl: './form.css',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class AttendanceFormComponent {
  private readonly fb = inject(FormBuilder);

  readonly clients = input.required<Client[]>();
  readonly submitting = input<boolean>(false);
  readonly errorMessage = input<string | null>(null);
  readonly successMessage = input<string | null>(null);
  readonly registerForClient = output<string>();

  readonly form = this.fb.nonNullable.group({
    client_id: ['', [Validators.required]],
    search: [''],
  });

  readonly searchTerm = signal('');

  readonly filteredClients = computed<Client[]>(() => {
    const term = this.searchTerm().trim().toLowerCase();
    const all = this.clients();
    if (term.length === 0) return all;
    return all.filter(
      (c) => c.ci.toLowerCase().includes(term) || c.name.toLowerCase().includes(term),
    );
  });

  onSearch(value: string): void {
    this.searchTerm.set(value);
  }

  onSubmit(): void {
    if (this.form.invalid || this.submitting()) return;
    const id = this.form.controls.client_id.value;
    this.registerForClient.emit(id);
    this.form.controls.client_id.reset('');
  }
}
