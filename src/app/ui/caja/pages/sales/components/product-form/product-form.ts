import { ChangeDetectionStrategy, Component, computed, inject, input, output } from '@angular/core';
import { DecimalPipe } from '@angular/common';
import { FormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { Client } from '../../../../../../models/client.model';
import { Product } from '../../../../../../models/product.model';
import { RegisterSaleProductInput } from '../../../../../../services/sale/sale.service';

@Component({
  selector: 'app-caja-sales-product-form',
  imports: [ReactiveFormsModule, DecimalPipe],
  templateUrl: './product-form.html',
  styleUrl: './product-form.css',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class SalesProductFormComponent {
  private readonly fb = inject(FormBuilder);

  readonly products = input.required<Product[]>();
  readonly clients = input.required<Client[]>();
  readonly submitting = input<boolean>(false);
  readonly errorMessage = input<string | null>(null);
  readonly submitForm = output<RegisterSaleProductInput>();
  readonly cancel = output<void>();

  readonly form = this.fb.nonNullable.group({
    product_id: ['', [Validators.required]],
    quantity: [1, [Validators.required, Validators.min(1)]],
    client_id: [''],
  });

  readonly availableProducts = computed(() => this.products().filter((p) => p.stock > 0));

  readonly selectedProduct = computed<Product | null>(() => {
    const id = this.form.controls.product_id.value;
    return this.products().find((p) => p.id === id) ?? null;
  });

  readonly estimatedTotal = computed(() => {
    const product = this.selectedProduct();
    const quantity = Number(this.form.controls.quantity.value) || 0;
    return product ? product.price * quantity : 0;
  });

  onSubmit(): void {
    if (this.form.invalid || this.submitting()) return;
    const raw = this.form.getRawValue();
    const clientId = raw.client_id.trim();
    this.submitForm.emit({
      product_id: raw.product_id,
      quantity: Math.trunc(Number(raw.quantity)),
      client_id: clientId.length > 0 ? clientId : null,
    });
  }
}
