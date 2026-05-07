import { ChangeDetectionStrategy, Component, computed, inject, signal } from '@angular/core';
import { CurrencyPipe, DecimalPipe } from '@angular/common';
import { Client } from '../../../../../models/client.model';
import { MembershipPlan } from '../../../../../models/membership-plan.model';
import { Product } from '../../../../../models/product.model';
import { SaleWithDetails } from '../../../../../models/sale.model';
import { AuthService } from '../../../../../services/auth/auth.service';
import { ClientQueryService } from '../../../../../services/client/query.service';
import { MembershipPlanQueryService } from '../../../../../services/membership-plan/query.service';
import { ProductQueryService } from '../../../../../services/product/query.service';
import { RegisterSaleMembershipInput, SaleService } from '../../../../../services/sale/sale.service';
import { SaleQueryService } from '../../../../../services/sale/query.service';
import { errorMessage } from '../../../../../utilities/error-message';
import { ConfirmDeleteModalComponent } from '../../../../shared/confirm-delete-modal.component';
import { SalesMembershipFormComponent } from '../components/membership-form/membership-form';
import { SalesListComponent } from '../components/list/list';

// Item del carrito en memoria. NO existe en DB; se materializa en N rows
// de sales cuando se cobra. stock_available es el snapshot al agregar — el
// usuario no puede sumar mas allá; si entre tanto otra caja vendió y ya no
// hay stock, el RPC tira error y mostramos cuál falló.
interface CartItem {
  product_id: string;
  product_name: string;
  category: string | null;
  unit_price: number;
  stock_available: number;
  quantity: number;
}

type PaymentMethod = 'cash' | 'card' | 'qr';
type Mode = 'products' | 'membership';

@Component({
  selector: 'app-caja-sales',
  imports: [CurrencyPipe, DecimalPipe, ConfirmDeleteModalComponent, SalesMembershipFormComponent, SalesListComponent],
  templateUrl: './component.html',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class CajaSalesContainerComponent {
  private readonly saleService = inject(SaleService);
  private readonly saleQuery = inject(SaleQueryService);
  private readonly productQuery = inject(ProductQueryService);
  private readonly clientQuery = inject(ClientQueryService);
  private readonly planQuery = inject(MembershipPlanQueryService);
  private readonly auth = inject(AuthService);

  readonly sales = signal<SaleWithDetails[]>([]);
  readonly products = signal<Product[]>([]);
  readonly clients = signal<Client[]>([]);
  readonly plans = signal<MembershipPlan[]>([]);
  readonly loading = signal(false);

  // Tab activa. Productos = catalogo POS + carrito. Membresía = form clasico.
  readonly mode = signal<Mode>('products');

  // Estado del carrito de la venta en curso. Solo aplica a mode='products'.
  readonly cart = signal<CartItem[]>([]);
  readonly cartCustomerId = signal<string>('');
  readonly paymentMethod = signal<PaymentMethod>('cash');
  // Recibido del cliente para calcular vuelto. Solo aplica si method='cash'.
  readonly cashReceived = signal<number>(0);

  // Filtros del catalogo.
  readonly searchQuery = signal<string>('');
  readonly activeCategory = signal<string | null>(null);

  readonly submitting = signal(false);
  readonly formError = signal<string | null>(null);
  readonly isGym = computed(() => this.auth.businessType() === 'gym');

  // Modal de confirmación para cancelar una venta.
  readonly cancelling = signal<SaleWithDetails | null>(null);
  readonly cancellingError = signal<string | null>(null);
  readonly cancellingSubmitting = signal(false);

  readonly cancellingLabel = computed(() => {
    const s = this.cancelling();
    return s ? (s.product_name ?? s.plan_name ?? 'Venta') : null;
  });

  readonly cancellingInitials = computed(() => {
    const label = this.cancellingLabel();
    if (!label) return null;
    const parts = label.trim().split(/\s+/).filter(Boolean);
    if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
    return (parts[0][0] + parts[1][0]).toUpperCase();
  });

  readonly cancellingSublabel = computed(() => {
    const s = this.cancelling();
    if (!s) return null;
    const type = s.type === 'product' ? 'Producto' : 'Membresía';
    return s.client_label ? `${type} · ${s.client_label}` : type;
  });

  readonly cancellingAmount = computed(() => {
    const s = this.cancelling();
    return s ? `Bs ${Number(s.amount).toFixed(2)}` : null;
  });

  readonly cancellingDescription = computed(() => {
    const error = this.cancellingError();
    if (error) return error;
    const s = this.cancelling();
    if (!s) return '';
    if (s.type === 'product') {
      return `Se devolverán ${s.quantity} unidad${s.quantity !== 1 ? 'es' : ''} al stock de "${s.product_name ?? '—'}".`;
    }
    return `La membresía "${s.plan_name ?? '—'}" del socio quedará desactivada.`;
  });

  // Solo productos con stock — los demas no aparecen en el catalogo.
  readonly availableProducts = computed(() => this.products().filter((p) => p.stock > 0));

  // Categorias unicas extraidas de los productos disponibles, alfabetizadas.
  // Se usa para los chips del filtro.
  readonly categories = computed<string[]>(() => {
    const set = new Set<string>();
    for (const p of this.availableProducts()) {
      if (p.category?.name) set.add(p.category.name);
    }
    return Array.from(set).sort();
  });

  // Productos que pasan el search + filtro de categoria.
  readonly filteredProducts = computed(() => {
    const q = this.searchQuery().toLowerCase().trim();
    const cat = this.activeCategory();
    return this.availableProducts().filter((p) => {
      if (cat && p.category?.name !== cat) return false;
      if (q && !p.name.toLowerCase().includes(q)) return false;
      return true;
    });
  });

  readonly cartSubtotal = computed(() =>
    this.cart().reduce((s, i) => s + i.unit_price * i.quantity, 0),
  );

  readonly cartItemCount = computed(() => this.cart().length);

  readonly cartTotalQuantity = computed(() =>
    this.cart().reduce((s, i) => s + i.quantity, 0),
  );

  // Vuelto en efectivo. Negativo significa "falta", lo bloqueamos en la UI.
  readonly cashChange = computed(() => this.cashReceived() - this.cartSubtotal());

  // Cliente seleccionado (objeto, para mostrar nombre + CI en el panel).
  readonly selectedCustomer = computed<Client | null>(() => {
    const id = this.cartCustomerId();
    if (!id) return null;
    return this.clients().find((c) => c.id === id) ?? null;
  });

  readonly canCharge = computed(() => {
    if (this.cart().length === 0) return false;
    if (this.submitting()) return false;
    // En efectivo, el recibido tiene que cubrir el subtotal.
    if (this.paymentMethod() === 'cash' && this.cashReceived() < this.cartSubtotal()) return false;
    return true;
  });

  constructor() {
    void this.refresh();
  }

  async refresh(): Promise<void> {
    this.loading.set(true);
    try {
      const tasks: Promise<unknown>[] = [
        this.saleQuery.listSales().then((v) => this.sales.set(v)),
        this.productQuery.listProducts().then((v) => this.products.set(v)),
        this.clientQuery.listClients().then((v) => this.clients.set(v)),
      ];
      if (this.isGym()) {
        tasks.push(this.planQuery.listPlans().then((v) => this.plans.set(v)));
      }
      await Promise.all(tasks);
    } catch (err: unknown) {
      console.error('Error cargando ventas', err);
    } finally {
      this.loading.set(false);
    }
  }

  // Tab switch. Si pasamos a membresia, no descartamos el carrito —
  // el caja puede volver a productos sin perder lo que tenia.
  setMode(m: Mode): void {
    this.mode.set(m);
    this.formError.set(null);
  }

  // Agregar al carrito. Si ya esta, +1 (capped al stock); si no, push nuevo.
  addToCart(product: Product): void {
    if (product.stock <= 0) return;
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
        quantity: 1,
      },
    ]);
  }

  // delta puede ser +1 o -1. Si llega a 0 se borra el item.
  // No deja superar stock_available.
  updateQty(productId: string, delta: number): void {
    this.cart.update((c) =>
      c
        .map((i) => {
          if (i.product_id !== productId) return i;
          const next = i.quantity + delta;
          if (next > i.stock_available) return i; // cap, no-op
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

  // Cobrar = un RPC por item. Secuencial para que cada uno valide stock
  // contra el estado actual de DB. Si alguno falla, juntamos los errores
  // y los mostramos sin descartar el carrito (asi el caja ve que pasó).
  async charge(): Promise<void> {
    if (!this.canCharge()) return;
    this.submitting.set(true);
    this.formError.set(null);

    const items = this.cart();
    const clientId = this.cartCustomerId() || null;
    const errors: string[] = [];

    for (const item of items) {
      try {
        await this.saleService.registerSaleProduct({
          product_id: item.product_id,
          quantity: item.quantity,
          client_id: clientId,
        });
      } catch (err: unknown) {
        errors.push(`${item.product_name}: ${errorMessage(err, 'error')}`);
      }
    }

    await this.refresh();

    if (errors.length === 0) {
      this.clearCart();
    } else {
      this.formError.set(errors.join(' · '));
    }
    this.submitting.set(false);
  }

  async handleSaleMembership(input: RegisterSaleMembershipInput): Promise<void> {
    this.submitting.set(true);
    this.formError.set(null);
    try {
      await this.saleService.registerSaleMembership(input);
      this.mode.set('products');
      await this.refresh();
    } catch (err: unknown) {
      this.formError.set(errorMessage(err, 'Error al registrar membresía'));
    } finally {
      this.submitting.set(false);
    }
  }

  handleCancel(sale: SaleWithDetails): void {
    this.cancelling.set(sale);
    this.cancellingError.set(null);
  }

  abortCancel(): void {
    if (this.cancellingSubmitting()) return;
    this.cancelling.set(null);
    this.cancellingError.set(null);
  }

  async confirmCancel(): Promise<void> {
    const sale = this.cancelling();
    if (!sale) return;
    this.cancellingSubmitting.set(true);
    this.cancellingError.set(null);
    try {
      await this.saleService.cancelSale(sale.id);
      this.cancelling.set(null);
      await this.refresh();
    } catch (err: unknown) {
      this.cancellingError.set(errorMessage(err, 'Error al cancelar venta'));
    } finally {
      this.cancellingSubmitting.set(false);
    }
  }

  // Util para deshabilitar el "+" cuando llegamos al stock.
  itemAtMax(item: CartItem): boolean {
    return item.quantity >= item.stock_available;
  }

  // Inicial 2 letras del producto para el cuadrito de la card (sin imagen).
  productInitials(name: string): string {
    const parts = name.trim().split(/\s+/).filter(Boolean);
    if (parts.length === 0) return '··';
    if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
    return (parts[0][0] + parts[1][0]).toUpperCase();
  }
}
