import { ChangeDetectionStrategy, Component, computed, effect, inject, input, output } from '@angular/core';
import { FormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { Table } from '../../../../../../models/table.model';
import { CreateTableInput } from '../../../../../../services/table/table.service';

@Component({
  selector: 'app-admin-tables-form',
  imports: [ReactiveFormsModule],
  templateUrl: './form.html',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class TablesFormComponent {
  private readonly fb = inject(FormBuilder);

  readonly value = input<Table | null>(null);
  readonly submitting = input<boolean>(false);
  readonly errorMessage = input<string | null>(null);
  readonly submitForm = output<CreateTableInput>();
  readonly cancel = output<void>();

  readonly isEdit = computed(() => this.value() !== null);

  readonly form = this.fb.nonNullable.group({
    name: ['', [Validators.required, Validators.minLength(1)]],
    is_active: [true],
  });

  constructor() {
    effect(() => {
      const v = this.value();
      if (v) {
        this.form.reset({ name: v.name, is_active: v.is_active });
      } else {
        this.form.reset({ name: '', is_active: true });
      }
    });
  }

  onSubmit(): void {
    if (this.form.invalid || this.submitting()) return;
    const raw = this.form.getRawValue();
    this.submitForm.emit({ name: raw.name.trim(), is_active: raw.is_active });
  }
}
