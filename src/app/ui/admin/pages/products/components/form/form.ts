import { ChangeDetectionStrategy, Component, inject, input, output } from '@angular/core';
import { FormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { CreateProductInput } from '../../../../../../services/product/product.service';

@Component({
  selector: 'app-admin-products-form',
  imports: [ReactiveFormsModule],
  templateUrl: './form.html',
  styleUrl: './form.css',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class ProductsFormComponent {
  private readonly fb = inject(FormBuilder);

  readonly submitting = input<boolean>(false);
  readonly errorMessage = input<string | null>(null);
  readonly submitForm = output<CreateProductInput>();
  readonly cancel = output<void>();

  readonly form = this.fb.nonNullable.group({
    name: ['', [Validators.required, Validators.minLength(2)]],
    description: [''],
    category: [''],
    price: [0, [Validators.required, Validators.min(0)]],
    cost: [0, [Validators.required, Validators.min(0)]],
    stock: [0, [Validators.required, Validators.min(0)]],
    provider: [''],
  });

  onSubmit(): void {
    if (this.form.invalid || this.submitting()) return;
    const raw = this.form.getRawValue();
    const description = raw.description.trim();
    const category = raw.category.trim();
    const provider = raw.provider.trim();
    this.submitForm.emit({
      name: raw.name.trim(),
      description: description.length > 0 ? description : null,
      category: category.length > 0 ? category : null,
      price: Number(raw.price),
      cost: Number(raw.cost),
      stock: Math.trunc(Number(raw.stock)),
      provider: provider.length > 0 ? provider : null,
    });
  }
}
