import { ChangeDetectionStrategy, Component, computed, effect, inject, input, output } from '@angular/core';
import { FormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { Category } from '../../../../../../models/category.model';
import { CreateCategoryInput } from '../../../../../../services/category/category.service';

@Component({
  selector: 'app-admin-categories-form',
  imports: [ReactiveFormsModule],
  templateUrl: './form.html',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class CategoriesFormComponent {
  private readonly fb = inject(FormBuilder);

  readonly value = input<Category | null>(null);
  readonly submitting = input<boolean>(false);
  readonly errorMessage = input<string | null>(null);
  readonly submitForm = output<CreateCategoryInput>();
  readonly cancel = output<void>();

  readonly isEdit = computed(() => this.value() !== null);

  readonly form = this.fb.nonNullable.group({
    name: ['', [Validators.required, Validators.minLength(2)]],
    description: [''],
  });

  constructor() {
    effect(() => {
      const v = this.value();
      if (v) {
        this.form.reset({ name: v.name, description: v.description ?? '' });
      } else {
        this.form.reset({ name: '', description: '' });
      }
    });
  }

  onSubmit(): void {
    if (this.form.invalid || this.submitting()) return;
    const raw = this.form.getRawValue();
    const description = raw.description.trim();
    this.submitForm.emit({
      name: raw.name.trim(),
      description: description.length > 0 ? description : null,
    });
  }
}
