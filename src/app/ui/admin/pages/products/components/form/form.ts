import { ChangeDetectionStrategy, Component, computed, effect, inject, input, output, signal } from '@angular/core';
import { FormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { Category } from '../../../../../../models/category.model';
import { Product } from '../../../../../../models/product.model';
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

  readonly value = input<Product | null>(null);
  readonly categories = input<Category[]>([]);
  readonly submitting = input<boolean>(false);
  readonly errorMessage = input<string | null>(null);
  readonly submitForm = output<CreateProductInput>();
  readonly cancel = output<void>();

  readonly isEdit = computed(() => this.value() !== null);

  readonly hasStock = signal(true);

  readonly form = this.fb.nonNullable.group({
    name: ['', [Validators.required, Validators.minLength(2)]],
    description: [''],
    category_id: [''],
    price: [0, [Validators.required, Validators.min(0)]],
    cost: [0, [Validators.required, Validators.min(0)]],
    stock: [0, [Validators.required, Validators.min(0)]],
    has_stock: [true],
    provider: [''],
  });

  constructor() {
    effect(() => {
      const v = this.value();
      if (v) {
        this.hasStock.set(v.has_stock);
        this.form.reset({
          name: v.name,
          description: v.description ?? '',
          category_id: v.category_id ?? '',
          price: v.price,
          cost: v.cost,
          stock: v.stock,
          has_stock: v.has_stock,
          provider: v.provider ?? '',
        });
      } else {
        this.hasStock.set(true);
        this.form.reset({
          name: '', description: '', category_id: '',
          price: 0, cost: 0, stock: 0, has_stock: true, provider: '',
        });
      }
    });
  }

  toggleHasStock(checked: boolean): void {
    this.hasStock.set(checked);
    this.form.controls.has_stock.setValue(checked);
  }

  onSubmit(): void {
    if (this.form.invalid || this.submitting()) return;
    const raw = this.form.getRawValue();
    const description = raw.description.trim();
    const provider = raw.provider.trim();
    this.submitForm.emit({
      name: raw.name.trim(),
      description: description.length > 0 ? description : null,
      category_id: raw.category_id.length > 0 ? raw.category_id : null,
      price: Number(raw.price),
      cost: Number(raw.cost),
      stock: Math.trunc(Number(raw.stock)),
      has_stock: raw.has_stock,
      provider: provider.length > 0 ? provider : null,
    });
  }
}
