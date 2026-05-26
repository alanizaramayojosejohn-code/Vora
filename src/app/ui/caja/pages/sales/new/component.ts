import { ChangeDetectionStrategy, Component, computed, effect, inject, signal } from '@angular/core';
import { CurrencyPipe, DecimalPipe } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { ActivatedRoute, Router } from '@angular/router';
import { Category } from '../../../../../models/category.model';
import { Client } from '../../../../../models/client.model';
import { Product } from '../../../../../models/product.model';
import { CategoryQueryService } from '../../../../../services/category/query.service';
import { ClientQueryService } from '../../../../../services/client/query.service';
import { ProductQueryService } from '../../../../../services/product/query.service';
import { CreateProductInput, ProductService } from '../../../../../services/product/product.service';
import { OrderService } from '../../../../../services/order/order.service';
import { NetworkService } from '../../../../../services/network/network.service';
import { OfflineQueueService } from '../../../../../services/offline/offline-queue.service';
import { ProductCacheService } from '../../../../../services/offline/product-cache.service';
import { errorMessage } from '../../../../../utilities/error-message';
import { ProductsFormComponent } from '../../../../admin/pages/products/components/form/form';

const PRODUCT_PAGE_SIZE = 20;

interface CartItem {
  product_id: string;
  product_name: string;
  category: string | null;
  unit_price: number;
  stock_available: number;
  has_stock: boolean;
  quantity: number;
}

type PaymentMethod = 'cash' | 'card' | 'qr';

@Component({
  selector: 'app-caja-sales-new',
  imports: [CurrencyPipe, DecimalPipe, FormsModule, ProductsFormComponent],
  templateUrl: './component.html',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class CajaSalesNewComponent {
  private readonly orderService   = inject(OrderService);
  private readonly productQuery   = inject(ProductQueryService);
  private readonly productService = inject(ProductService);
  private readonly categoryQuery  = inject(CategoryQueryService);
  private readonly clientQuery    = inject(ClientQueryService);
  private readonly router         = inject(Router);
  private readonly route          = inject(ActivatedRoute);
  private readonly network        = inject(NetworkService);
  private readonly offlineQueue   = inject(OfflineQueueService);
  private readonly productCache   = inject(ProductCacheService);

  readonly products = signal<Product[]>([]);
  readonly clients = signal<Client[]>([]);
  readonly modalCategories = signal<Category[]>([]);
  readonly loading = signal(false);
  readonly fromCache = signal(false);
  readonly queuedMessage = signal<string | null>(null);

  readonly showNewProductModal = signal(false);
  readonly newProductSubmitting = signal(false);
  readonly newProductError = signal<string | null>(null);

  readonly cart = signal<CartItem[]>([]);
  readonly cartCustomerId = signal<string>('');
  readonly paymentMethod = signal<PaymentMethod>('cash');
  readonly cashReceived = signal<number>(0);

  readonly searchQuery = signal<string>('');
  readonly activeCategory = signal<string | null>(null);
  readonly productPage = signal(1);

  readonly orderNote = signal('');
  readonly submitting = signal(false);
  readonly formError = signal<string | null>(null);

  readonly availableProducts = computed(() =>
    this.products().filter((p) => !p.has_stock || p.stock > 0)
  );

  readonly categories = computed<string[]>(() => {
    const set = new Set<string>();
    for (const p of this.availableProducts()) {
      if (p.category?.name) set.add(p.category.name);
    }
    return Array.from(set).sort();
  });

  readonly filteredProducts = computed(() => {
    const q = this.searchQuery().toLowerCase().trim();
    const cat = this.activeCategory();
    return this.availableProducts().filter((p) => {
      if (cat && p.category?.name !== cat) return false;
      if (q && !p.name.toLowerCase().includes(q)) return false;
      return true;
    });
  });

  readonly totalProductPages = computed(() =>
    Math.max(1, Math.ceil(this.filteredProducts().length / PRODUCT_PAGE_SIZE)),
  );

  readonly paginatedProducts = computed(() => {
    const p = this.productPage();
    return this.filteredProducts().slice((p - 1) * PRODUCT_PAGE_SIZE, p * PRODUCT_PAGE_SIZE);
  });

  readonly productPageNumbers = computed(() =>
    Array.from({ length: this.totalProductPages() }, (_, i) => i + 1),
  );

  readonly cartSubtotal = computed(() =>
    this.cart().reduce((s, i) => s + i.unit_price * i.quantity, 0),
  );
  readonly cartItemCount = computed(() => this.cart().length);
  readonly cartTotalQuantity = computed(() => this.cart().reduce((s, i) => s + i.quantity, 0));
  readonly cashChange = computed(() => this.cashReceived() - this.cartSubtotal());

  readonly selectedCustomer = computed<Client | null>(() => {
    const id = this.cartCustomerId();
    if (!id) return null;
    return this.clients().find((c) => c.id === id) ?? null;
  });

  readonly canCharge = computed(() => {
    if (this.cart().length === 0) return false;
    if (this.submitting()) return false;
    if (this.paymentMethod() === 'cash' && this.cashReceived() < this.cartSubtotal()) return false;
    return true;
  });

  constructor() {
    void this.load();
    effect(() => {
      this.searchQuery();
      this.activeCategory();
      this.productPage.set(1);
    });
  }

  async load(): Promise<void> {
    this.loading.set(true);
    this.fromCache.set(false);

    if (!this.network.isOnline()) {
      const cached = this.productCache.load();
      if (cached) {
        this.products.set(cached);
        this.fromCache.set(true);
      }
      this.loading.set(false);
      return;
    }

    try {
      await Promise.all([
        this.productQuery.listProducts().then((v) => {
          this.products.set(v);
          this.productCache.save(v);
        }),
        this.clientQuery.listClients().then((v) => this.clients.set(v)),
        this.categoryQuery.listCategories().then((v) => this.modalCategories.set(v)),
      ]);
    } catch (err) {
      console.error('Error cargando datos', err);
      const cached = this.productCache.load();
      if (cached) {
        this.products.set(cached);
        this.fromCache.set(true);
      }
    } finally {
      this.loading.set(false);
    }
  }

  openNewProductModal(): void {
    this.showNewProductModal.set(true);
    this.newProductError.set(null);
  }

  closeNewProductModal(): void {
    this.showNewProductModal.set(false);
    this.newProductError.set(null);
  }

  async handleQuickProduct(input: CreateProductInput): Promise<void> {
    this.newProductSubmitting.set(true);
    this.newProductError.set(null);
    try {
      const newProduct = await this.productService.createProduct(input);
      this.products.update((list) => [...list, newProduct]);
      this.closeNewProductModal();
    } catch (err: unknown) {
      this.newProductError.set(errorMessage(err, 'Error al crear producto'));
      this.newProductSubmitting.set(false);
    }
  }

  goBack(): void {
    void this.router.navigate(['..'], { relativeTo: this.route });
  }

  setProductPage(p: number): void {
    this.productPage.set(p);
  }

  addToCart(product: Product): void {
    if (product.has_stock && product.stock <= 0) return;
    const existing = this.cart().find((i) => i.product_id === product.id);
    if (existing) {
      this.updateQty(product.id, 1);
      return;
    }
    this.cart.update((c) => [
      ...c,
      {
        product_id: product.id,
        product_name: product.name,
        category: product.category?.name ?? null,
        unit_price: Number(product.price),
        stock_available: product.stock,
        has_stock: product.has_stock,
        quantity: 1,
      },
    ]);
  }

  updateQty(productId: string, delta: number): void {
    this.cart.update((c) =>
      c
        .map((i) => {
          if (i.product_id !== productId) return i;
          const next = i.quantity + delta;
          if (i.has_stock && next > i.stock_available) return i;
          return { ...i, quantity: next };
        })
        .filter((i) => i.quantity > 0),
    );
  }

  removeFromCart(productId: string): void {
    this.cart.update((c) => c.filter((i) => i.product_id !== productId));
  }

  clearCart(): void {
    this.cart.set([]);
    this.cartCustomerId.set('');
    this.cashReceived.set(0);
    this.orderNote.set('');
    this.formError.set(null);
  }

  setSearch(value: string): void {
    this.searchQuery.set(value);
  }

  selectCategory(cat: string | null): void {
    this.activeCategory.set(cat);
  }

  selectCustomer(id: string): void {
    this.cartCustomerId.set(id);
  }

  setPaymentMethod(m: PaymentMethod): void {
    this.paymentMethod.set(m);
    if (m !== 'cash') this.cashReceived.set(0);
  }

  setCashReceived(value: number): void {
    this.cashReceived.set(Math.max(0, isFinite(value) ? value : 0));
  }

  async charge(): Promise<void> {
    if (!this.canCharge()) return;
    this.submitting.set(true);
    this.formError.set(null);

    const orderInput = {
      client_id:      this.cartCustomerId() || null,
      payment_method: this.paymentMethod(),
      notes:          this.orderNote().trim() || null,
      items:          this.cart().map((item) => ({
        product_id: item.product_id,
        quantity:   item.quantity,
        unit_price: item.unit_price,
      })),
    };

    if (!this.network.isOnline()) {
      this.offlineQueue.enqueue(orderInput);
      this.clearCart();
      this.submitting.set(false);
      this.queuedMessage.set('Venta guardada localmente — se sincronizará al recuperar conexión');
      setTimeout(() => this.queuedMessage.set(null), 4000);
      return;
    }

    try {
      await this.orderService.registerOrder(orderInput);
      this.goBack();
    } catch (err: unknown) {
      this.formError.set(errorMessage(err, 'Error al procesar la venta'));
      this.submitting.set(false);
    }
  }

  itemAtMax(item: CartItem): boolean {
    return item.has_stock && item.quantity >= item.stock_available;
  }

  productInitials(name: string): string {
    const parts = name.trim().split(/\s+/).filter(Boolean);
    if (parts.length === 0) return '··';
    if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
    return (parts[0][0] + parts[1][0]).toUpperCase();
  }
}
