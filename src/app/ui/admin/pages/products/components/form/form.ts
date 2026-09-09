import { ChangeDetectionStrategy, Component, computed, DestroyRef, effect, inject, input, output, signal } from '@angular/core';
import { FormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { Category } from '../../../../../../models/category.model';
import { Product } from '../../../../../../models/product.model';
import { CreateProductInput } from '../../../../../../services/product/product.service';
import { CategoryService } from '../../../../../../services/category/category.service';
import { errorMessage } from '../../../../../../utilities/error-message';
import { compressProductImage, formatBytes } from '../../../../../../utilities/image-compressor';

export interface ProductFormValue {
  product: CreateProductInput;
  /** Ya comprimido a WebP. null = no se tocó la imagen. */
  imageFile: File | null;
  /** true = borrar la imagen que ya tenía. */
  removeImage: boolean;
}

@Component({
  selector: 'app-admin-products-form',
  imports: [ReactiveFormsModule],
  templateUrl: './form.html',
  styleUrl: './form.css',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class ProductsFormComponent {
  private readonly fb = inject(FormBuilder);
  private readonly categoryService = inject(CategoryService);

  readonly value = input<Product | null>(null);
  readonly categories = input<Category[]>([]);
  readonly submitting = input<boolean>(false);
  readonly errorMessage = input<string | null>(null);
  readonly submitForm = output<ProductFormValue>();
  readonly cancel = output<void>();

  readonly isEdit = computed(() => this.value() !== null);

  readonly hasStock = signal(true);

  // ── Imagen ────────────────────────────────────────────────────────────────
  readonly imageFile = signal<File | null>(null);
  readonly imagePreview = signal<string | null>(null);
  readonly imageRemoved = signal(false);
  readonly compressing = signal(false);
  readonly imageError = signal<string | null>(null);
  /** "2,4 MB → 38 KB", para que se vea que el compresor hizo algo. */
  readonly compressionInfo = signal<string | null>(null);

  // La URL viva se guarda fuera de la señal: revocarla desde el effect que
  // resetea el formulario leería la señal y el effect se re-dispararía solo.
  private previewUrl: string | null = null;

  readonly existingImageUrl = computed(() => this.value()?.image_url ?? null);
  readonly showExistingImage = computed(
    () => !this.imageRemoved() && !this.imagePreview() && !!this.existingImageUrl(),
  );
  readonly hasAnyImage = computed(() => !!this.imagePreview() || this.showExistingImage());

  readonly showCreateCategory = signal(false);
  readonly creatingCategory = signal(false);
  readonly createCategoryError = signal<string | null>(null);
  readonly localNewCategories = signal<Category[]>([]);

  readonly allCategories = computed(() => {
    const base = this.categories();
    const local = this.localNewCategories();
    const ids = new Set(base.map((c) => c.id));
    return [...base, ...local.filter((c) => !ids.has(c.id))];
  });

  readonly categoryForm = this.fb.nonNullable.group({
    name: ['', [Validators.required, Validators.minLength(2)]],
    description: [''],
  });

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
    inject(DestroyRef).onDestroy(() => this.releasePreview());

    effect(() => {
      const v = this.value();
      this.resetImageState();
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

  private releasePreview(): void {
    if (this.previewUrl) URL.revokeObjectURL(this.previewUrl);
    this.previewUrl = null;
  }

  private resetImageState(): void {
    this.releasePreview();
    this.imageFile.set(null);
    this.imagePreview.set(null);
    this.imageRemoved.set(false);
    this.imageError.set(null);
    this.compressionInfo.set(null);
    this.compressing.set(false);
  }

  async onImageFileChange(event: Event): Promise<void> {
    const input = event.target as HTMLInputElement;
    const file = input.files?.[0] ?? null;
    // Se limpia el input para que elegir el mismo archivo otra vez, después de
    // un error, vuelva a disparar el change.
    input.value = '';
    if (!file) return;

    this.imageError.set(null);
    this.compressing.set(true);
    try {
      const result = await compressProductImage(file);
      this.releasePreview();
      this.previewUrl = URL.createObjectURL(result.file);
      this.imageFile.set(result.file);
      this.imagePreview.set(this.previewUrl);
      this.imageRemoved.set(false);
      this.compressionInfo.set(
        `${formatBytes(result.originalBytes)} → ${formatBytes(result.bytes)} · ${result.width}×${result.height}`,
      );
    } catch (err: unknown) {
      this.imageError.set(errorMessage(err, 'No se pudo procesar la imagen'));
    } finally {
      this.compressing.set(false);
    }
  }

  clearPickedImage(): void {
    this.releasePreview();
    this.imageFile.set(null);
    this.imagePreview.set(null);
    this.compressionInfo.set(null);
    this.imageError.set(null);
  }

  removeExistingImage(): void {
    this.clearPickedImage();
    this.imageRemoved.set(true);
  }

  openCreateCategory(): void {
    this.showCreateCategory.set(true);
    this.createCategoryError.set(null);
    this.categoryForm.reset({ name: '', description: '' });
  }

  cancelCreateCategory(): void {
    this.showCreateCategory.set(false);
    this.createCategoryError.set(null);
  }

  async submitCreateCategory(): Promise<void> {
    if (this.categoryForm.invalid || this.creatingCategory()) return;
    this.creatingCategory.set(true);
    this.createCategoryError.set(null);
    try {
      const raw = this.categoryForm.getRawValue();
      const desc = raw.description.trim();
      const cat = await this.categoryService.createCategory({
        name: raw.name.trim(),
        description: desc.length > 0 ? desc : null,
      });
      this.localNewCategories.update((list) => [...list, cat]);
      this.form.controls.category_id.setValue(cat.id);
      this.showCreateCategory.set(false);
    } catch (err: unknown) {
      this.createCategoryError.set(errorMessage(err, 'Error al crear categoría'));
    } finally {
      this.creatingCategory.set(false);
    }
  }

  onSubmit(): void {
    if (this.form.invalid || this.submitting() || this.compressing()) return;
    const raw = this.form.getRawValue();
    const description = raw.description.trim();
    const provider = raw.provider.trim();
    this.submitForm.emit({
      product: {
        name: raw.name.trim(),
        description: description.length > 0 ? description : null,
        category_id: raw.category_id.length > 0 ? raw.category_id : null,
        price: Number(raw.price),
        cost: Number(raw.cost),
        stock: Math.trunc(Number(raw.stock)),
        has_stock: raw.has_stock,
        provider: provider.length > 0 ? provider : null,
      },
      imageFile: this.imageFile(),
      removeImage: this.imageRemoved(),
    });
  }
}
