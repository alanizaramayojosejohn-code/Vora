import { ChangeDetectionStrategy, Component, computed, effect, inject, signal } from '@angular/core';
import { CurrencyPipe, DecimalPipe } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { ActivatedRoute, Router, RouterLink } from '@angular/router';
import { Category } from '../../../../../models/category.model';
import { Client } from '../../../../../models/client.model';
import { Product } from '../../../../../models/product.model';
import { Table } from '../../../../../models/table.model';
import {
  canSettleOrder,
  orderDestinationLabel,
  orderPrimaryLabel,
  OrderWithDetails,
} from '../../../../../models/order.model';
import { PaymentLine, validatePaymentSplit } from '../../../../../models/payment-split.model';
import { CategoryQueryService } from '../../../../../services/category/query.service';
import { ClientQueryService } from '../../../../../services/client/query.service';
import { ClientService, CreateClientInput } from '../../../../../services/client/client.service';
import { ProductQueryService } from '../../../../../services/product/query.service';
import { ProductService } from '../../../../../services/product/product.service';
import { OrderService, RegisterOrderInput, RegisterProductItem } from '../../../../../services/order/order.service';
import { OrderQueryService } from '../../../../../services/order/query.service';
import { TableQueryService } from '../../../../../services/table/query.service';
import { AuthService } from '../../../../../services/auth/auth.service';
import { CashSessionService } from '../../../../../services/cash-session/cash-session.service';
import { SubscriptionStateService } from '../../../../../services/subscription/subscription-state.service';
import { NetworkService } from '../../../../../services/network/network.service';
import { OfflineQueueService } from '../../../../../services/offline/offline-queue.service';
import { ProductCacheService } from '../../../../../services/offline/product-cache.service';
import { errorMessage } from '../../../../../utilities/error-message';
import { ClientsFormComponent } from '../../../../admin/pages/clients/components/form/form';
import { ProductFormValue, ProductsFormComponent } from '../../../../admin/pages/products/components/form/form';
import { FormModalComponent } from '../../../../shared/form-modal.component';
import { PaymentLinesComponent } from '../components/payment-lines/payment-lines';
import { SettleModalComponent } from '../components/settle-modal/settle-modal';

const PRODUCT_PAGE_SIZE = 20;

// Valor del selector de destino cuando el pedido no va a una mesa física.
// Mesa y "para llevar" son excluyentes (RF-4), y un solo select lo garantiza
// sin ninguna validación cruzada.
const TAKEAWAY_VALUE = '__takeaway__';

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

// Una cuenta abierta, tal como se ve en la franja de tarjetas (RF-7). Puede
// venir del servidor o de la cola offline de este dispositivo: la pantalla no
// distingue, salvo por la marca de "sin sincronizar".
interface PendingCard {
  key: string;
  order_uuid: string | null;
  order_id: string | null;
  destination: string;
  total: number;
  summary: string;
  can_settle: boolean;
  synced: boolean;
  table_id: string | null;
}

@Component({
  selector: 'app-caja-sales-new',
  imports: [
    CurrencyPipe, DecimalPipe, FormsModule, RouterLink,
    ProductsFormComponent, ClientsFormComponent, FormModalComponent,
    PaymentLinesComponent, SettleModalComponent,
  ],
  templateUrl: './component.html',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class CajaSalesNewComponent {
  private readonly orderService   = inject(OrderService);
  private readonly orderQuery     = inject(OrderQueryService);
  private readonly productQuery   = inject(ProductQueryService);
  private readonly productService = inject(ProductService);
  private readonly categoryQuery  = inject(CategoryQueryService);
  private readonly clientQuery    = inject(ClientQueryService);
  private readonly clientService  = inject(ClientService);
  private readonly tableQuery     = inject(TableQueryService);
  private readonly router         = inject(Router);
  private readonly route          = inject(ActivatedRoute);
  private readonly network        = inject(NetworkService);
  private readonly offlineQueue   = inject(OfflineQueueService);
  private readonly productCache   = inject(ProductCacheService);
  private readonly cashSessions   = inject(CashSessionService);
  private readonly subscriptionState = inject(SubscriptionStateService);
  private readonly auth           = inject(AuthService);

  // Turno abierto. Si no hay, la venta se registra igual pero queda fuera del
  // arqueo — el aviso en pantalla hace visible el hueco en vez de callarlo.
  readonly cashSession = this.cashSessions.current;

  // Esta pantalla la comparten caja y admin. El enlace para abrir turno tiene
  // que quedarse en el panel de quien está vendiendo: mandar al admin a /caja
  // lo sacaría de su propio menú.
  readonly shiftLink = computed(() =>
    this.auth.role() === 'admin' ? '/admin/turno' : '/caja/turno',
  );

  readonly products = signal<Product[]>([]);
  readonly clients = signal<Client[]>([]);
  readonly tables = signal<Table[]>([]);
  readonly modalCategories = signal<Category[]>([]);
  readonly loading = signal(false);
  readonly fromCache = signal(false);
  readonly queuedMessage = signal<string | null>(null);

  readonly showNewProductModal = signal(false);
  readonly newProductSubmitting = signal(false);
  readonly newProductError = signal<string | null>(null);

  readonly showNewClientModal = signal(false);
  readonly newClientSubmitting = signal(false);
  readonly newClientError = signal<string | null>(null);

  // La observación arranca plegada: es opcional y ocupa el alto de tres ítems.
  readonly showNote = signal(false);

  readonly cart = signal<CartItem[]>([]);
  readonly cartCustomerId = signal<string>('');
  readonly destination = signal<string>('');
  readonly paymentMethod = signal<PaymentMethod>('cash');
  readonly cashReceived = signal<number>(0);
  readonly splitMode = signal(false);
  readonly paymentLines = signal<PaymentLine[]>([]);

  readonly searchQuery = signal<string>('');
  readonly activeCategory = signal<string | null>(null);
  readonly productPage = signal(1);

  readonly orderNote = signal('');
  readonly submitting = signal(false);
  readonly formError = signal<string | null>(null);

  // Cuentas abiertas del servidor. Las de este dispositivo que todavía no
  // sincronizaron se superponen desde la cola (ver pendingCards).
  readonly remotePending = signal<OrderWithDetails[]>([]);
  readonly pendingError = signal<string | null>(null);

  // Cuenta a la que se le están agregando productos. Con una seleccionada, el
  // carrito deja de ser una venta nueva y pasa a ser "lo que la mesa pidió
  // además".
  readonly activePendingKey = signal<string | null>(null);

  readonly settleTarget = signal<PendingCard | null>(null);
  readonly settleSubmitting = signal(false);
  readonly settleError = signal<string | null>(null);

  // Clave de idempotencia de la venta en curso. Se mantiene entre reintentos
  // para que "Cobrar" tras un error de red no registre la venta dos veces, y
  // se descarta al vaciar el carrito (que es una venta distinta).
  private pendingSaleUuid: string | null = null;

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

  // Suscripción vencida: no se puede cobrar. Se evalúa acá y no con la
  // directiva porque este botón ya tiene su propio [disabled].
  readonly readonlyMode = computed(() => this.subscriptionState.status()?.isBlocked ?? false);

  // La franja de cuentas abiertas: lo del servidor más lo que este dispositivo
  // encoló y todavía no sincronizó. Sin esta superposición, un pendiente
  // creado sin conexión desaparecería de la pantalla hasta volver la señal.
  readonly pendingCards = computed<PendingCard[]>(() => {
    const userId = this.auth.session()?.user.id ?? null;
    const role = this.auth.role();
    const cards = new Map<string, PendingCard>();

    for (const order of this.remotePending()) {
      const key = order.client_uuid ?? order.id;
      cards.set(key, {
        key,
        order_uuid: order.client_uuid,
        order_id: order.id,
        destination: orderDestinationLabel(order) ?? 'Sin mesa',
        total: Number(order.total_amount),
        summary: orderPrimaryLabel(order),
        can_settle: canSettleOrder(order, userId, role),
        synced: true,
        table_id: order.table_id,
      });
    }

    for (const op of this.offlineQueue.pending()) {
      if (op.kind === 'create') {
        if (op.input.status !== 'pending') continue;
        cards.set(op.order_uuid, {
          key: op.order_uuid,
          order_uuid: op.order_uuid,
          order_id: null,
          destination: this.destinationLabelFor(op.input),
          total: this.itemsTotal(op.input.items),
          summary: this.summarizeItems(op.input.items),
          can_settle: true,
          synced: false,
          table_id: op.input.table_id ?? null,
        });
        continue;
      }

      const card = cards.get(op.order_uuid);
      if (!card) continue;

      if (op.kind === 'add_items') {
        cards.set(op.order_uuid, {
          ...card,
          total: card.total + this.itemsTotal(op.items),
          synced: false,
        });
      } else {
        // Ya está cobrada en este dispositivo: sacarla de la franja evita que
        // se cobre dos veces mientras la operación espera para sincronizar.
        cards.delete(op.order_uuid);
      }
    }

    return [...cards.values()];
  });

  readonly activePending = computed<PendingCard | null>(() => {
    const key = this.activePendingKey();
    if (!key) return null;
    return this.pendingCards().find((c) => c.key === key) ?? null;
  });

  readonly activeTables = computed(() => this.tables());

  // RF-6: la mesa elegida ya tiene una cuenta abierta. En vez de dejar que el
  // servidor rechace la creación, se avisa antes y se ofrece lo que el cajero
  // realmente quiere hacer: sumar los productos a esa cuenta.
  readonly tableConflict = computed<PendingCard | null>(() => {
    if (this.activePending()) return null;
    const tableId = this.selectedTableId();
    if (!tableId) return null;
    return this.pendingCards().find((c) => c.table_id === tableId) ?? null;
  });

  readonly splitCheck = computed(() => validatePaymentSplit(this.paymentLines(), this.cartSubtotal()));

  readonly canCharge = computed(() => {
    if (this.cart().length === 0) return false;
    if (this.submitting()) return false;
    if (this.readonlyMode()) return false;
    if (this.activePending()) return false;
    if (this.splitMode()) return this.splitCheck().valid;
    if (this.paymentMethod() === 'cash' && this.cashReceived() < this.cartSubtotal()) return false;
    return true;
  });

  // Dejar pendiente no exige método de pago (RF-5): todavía no se cobra nada.
  readonly canLeavePending = computed(() => {
    if (this.cart().length === 0) return false;
    if (this.submitting()) return false;
    if (this.readonlyMode()) return false;
    if (this.activePending()) return false;
    if (this.tableConflict()) return false;
    return true;
  });

  readonly canAddToPending = computed(() => {
    if (this.cart().length === 0) return false;
    if (this.submitting()) return false;
    if (this.readonlyMode()) return false;
    const pending = this.activePending();
    if (!pending) return false;
    // RF-28: sin conexión, sobre un pedido que este dispositivo no puede
    // identificar por uuid no se encola nada a ciegas.
    return pending.order_uuid !== null || this.network.isOnline();
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

    // Offline conserva el turno que se cargó la última vez que hubo red, que
    // es el correcto: el turno se abre al inicio de la jornada.
    if (this.network.isOnline()) {
      try {
        await this.cashSessions.loadCurrent();
      } catch {
        /* el aviso de turno es informativo; no debe romper la venta */
      }
    }

    // El catálogo de mesas se cachea, así que el selector sigue sirviendo sin
    // conexión con lo último sincronizado (RF-29).
    try {
      const { tables, fromCache } = await this.tableQuery.listActiveTablesWithCache();
      this.tables.set(tables);
      if (fromCache) this.fromCache.set(true);
    } catch {
      this.tables.set([]);
    }

    if (!this.network.isOnline()) {
      const cached = await this.productCache.load();
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
        this.refreshPending(),
      ]);
    } catch (err) {
      console.error('Error cargando datos', err);
      const cached = await this.productCache.load();
      if (cached) {
        this.products.set(cached);
        this.fromCache.set(true);
      }
    } finally {
      this.loading.set(false);
    }
  }

  async refreshPending(): Promise<void> {
    if (!this.network.isOnline()) return;
    this.pendingError.set(null);
    try {
      // Un admin ve las cuentas de todo el negocio; un cajero, solo las suyas
      // (RF-15, RF-16).
      const role = this.auth.role();
      const scope = role === 'admin' || role === 'super_admin'
        ? null
        : this.auth.session()?.user.id ?? null;
      this.remotePending.set(await this.orderQuery.listPendingOrders(scope));
    } catch (err: unknown) {
      this.pendingError.set(errorMessage(err, 'No se pudieron cargar las cuentas abiertas'));
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

  async handleQuickProduct(value: ProductFormValue): Promise<void> {
    this.newProductSubmitting.set(true);
    this.newProductError.set(null);

    let newProduct: Product;
    try {
      newProduct = await this.productService.createProduct(value.product);
    } catch (err: unknown) {
      this.newProductError.set(errorMessage(err, 'Error al crear producto'));
      this.newProductSubmitting.set(false);
      return;
    }

    // La imagen es accesoria en el alta rápida desde caja: si falla, el
    // producto igual entra al catálogo y se puede vender. Reabrir el modal
    // con el error haría que el cajero lo cree dos veces.
    if (value.imageFile) {
      try {
        const url = await this.productService.uploadImage(value.imageFile, newProduct.id);
        await this.productService.setImageUrl(newProduct.id, url);
        newProduct = { ...newProduct, image_url: url };
      } catch (err: unknown) {
        console.error('No se pudo subir la imagen del producto rápido', err);
      }
    }

    this.products.update((list) => [...list, newProduct]);
    this.closeNewProductModal();
  }

  openNewClientModal(): void {
    this.showNewClientModal.set(true);
    this.newClientError.set(null);
  }

  closeNewClientModal(): void {
    this.showNewClientModal.set(false);
    this.newClientError.set(null);
  }

  // El cliente recién creado queda elegido en la venta en curso: crearlo desde
  // acá y tener que buscarlo después en el select sería media función.
  async handleQuickClient(input: CreateClientInput): Promise<void> {
    this.newClientSubmitting.set(true);
    this.newClientError.set(null);
    try {
      const created = await this.clientService.createClient(input);
      this.clients.update((list) => [created, ...list]);
      this.cartCustomerId.set(created.id);
      this.closeNewClientModal();
    } catch (err: unknown) {
      this.newClientError.set(errorMessage(err, 'Error al crear el cliente'));
    } finally {
      this.newClientSubmitting.set(false);
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
    this.destination.set('');
    this.cashReceived.set(0);
    this.orderNote.set('');
    this.formError.set(null);
    this.splitMode.set(false);
    this.paymentLines.set([]);
    this.showNote.set(false);
    this.activePendingKey.set(null);
    this.pendingSaleUuid = null;
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

  selectDestination(value: string): void {
    this.destination.set(value);
  }

  setPaymentMethod(m: PaymentMethod): void {
    this.paymentMethod.set(m);
    if (m !== 'cash') this.cashReceived.set(0);
  }

  setSplitMode(split: boolean): void {
    this.splitMode.set(split);
    this.cashReceived.set(0);
    this.paymentLines.set(
      split ? [{ method: this.paymentMethod(), amount: this.cartSubtotal() }] : [],
    );
  }

  setCashReceived(value: number): void {
    this.cashReceived.set(Math.max(0, isFinite(value) ? value : 0));
  }

  // ── Cuentas abiertas ────────────────────────────────────────────────────

  selectPending(card: PendingCard): void {
    this.activePendingKey.set(card.key);
    this.formError.set(null);
  }

  clearActivePending(): void {
    this.activePendingKey.set(null);
    this.formError.set(null);
  }

  // Del aviso de "esta mesa ya tiene cuenta": pasa directo a sumarle productos.
  useConflictingPending(): void {
    const conflict = this.tableConflict();
    if (!conflict) return;
    this.destination.set('');
    this.selectPending(conflict);
  }

  openSettle(card: PendingCard): void {
    this.settleTarget.set(card);
    this.settleError.set(null);
  }

  closeSettle(): void {
    if (this.settleSubmitting()) return;
    this.settleTarget.set(null);
    this.settleError.set(null);
  }

  async confirmSettle(payments: PaymentLine[]): Promise<void> {
    const card = this.settleTarget();
    if (!card) return;

    this.settleSubmitting.set(true);
    this.settleError.set(null);

    const sessionId = this.cashSession()?.id ?? null;

    if (!this.network.isOnline()) {
      if (!card.order_uuid) {
        this.settleError.set('Esta cuenta se abrió en otro dispositivo: necesitas conexión para cobrarla.');
        this.settleSubmitting.set(false);
        return;
      }
      // El turno abierto AHORA viaja con la operación: al sincronizar, el cobro
      // se imputa a este turno y no al que esté abierto en ese momento (RF-27).
      this.offlineQueue.enqueueSettle(card.order_uuid, payments, card.total, sessionId);
      this.settleTarget.set(null);
      this.settleSubmitting.set(false);
      this.flashMessage('Cobro guardado localmente — se sincronizará al recuperar conexión');
      return;
    }

    try {
      await this.orderService.settleOrder(
        crypto.randomUUID(),
        { uuid: card.order_uuid, id: card.order_id },
        payments,
        card.total,
        sessionId,
      );
      this.settleTarget.set(null);
      if (this.activePendingKey() === card.key) this.activePendingKey.set(null);
      await this.refreshPending();
      this.flashMessage('Cuenta cobrada');
    } catch (err: unknown) {
      this.settleError.set(errorMessage(err, 'Error al cobrar la cuenta'));
      // El total pudo haber cambiado en otro dispositivo (VORA6): recargar deja
      // la tarjeta con el importe real para volver a cobrar sobre ese.
      await this.refreshPending();
    } finally {
      this.settleSubmitting.set(false);
    }
  }

  // ── Registrar ───────────────────────────────────────────────────────────

  async charge(): Promise<void> {
    if (!this.canCharge()) return;
    await this.register('settled');
  }

  async leavePending(): Promise<void> {
    if (!this.canLeavePending()) return;
    await this.register('pending');
  }

  async addToActivePending(): Promise<void> {
    if (!this.canAddToPending()) return;
    const card = this.activePending();
    if (!card) return;

    this.submitting.set(true);
    this.formError.set(null);
    const items = this.cartItems();

    if (!this.network.isOnline()) {
      if (!card.order_uuid) {
        this.formError.set('Esta cuenta se abrió en otro dispositivo: necesitas conexión para agregarle productos.');
        this.submitting.set(false);
        return;
      }
      this.offlineQueue.enqueueAddItems(card.order_uuid, items);
      this.clearCart();
      this.submitting.set(false);
      this.flashMessage('Productos guardados localmente — se sincronizarán al recuperar conexión');
      return;
    }

    try {
      await this.orderService.addItems(
        crypto.randomUUID(),
        { uuid: card.order_uuid, id: card.order_id },
        items,
      );
      this.clearCart();
      await this.refreshPending();
      this.flashMessage(`Productos agregados a ${card.destination}`);
    } catch (err: unknown) {
      this.formError.set(errorMessage(err, 'Error al agregar productos a la cuenta'));
    } finally {
      this.submitting.set(false);
    }
  }

  private async register(status: 'pending' | 'settled'): Promise<void> {
    this.submitting.set(true);
    this.formError.set(null);

    const total = this.cartSubtotal();
    const payments: PaymentLine[] | null = status === 'pending'
      ? null
      : this.splitMode()
        ? this.paymentLines()
        : total > 0 ? [{ method: this.paymentMethod(), amount: total }] : [];

    const orderInput: RegisterOrderInput = {
      client_id:       this.cartCustomerId() || null,
      payment_method:  status === 'pending' ? null : this.paymentMethod(),
      notes:           this.orderNote().trim() || null,
      cash_session_id: this.cashSession()?.id ?? null,
      table_id:        this.selectedTableId(),
      is_takeaway:     this.destination() === TAKEAWAY_VALUE,
      status,
      payments,
      items:           this.cartItems(),
    };

    // El uuid se genera acá y no en el servidor: es la identidad con la que las
    // operaciones siguientes (agregar ítems, cobrar) referencian al pedido,
    // incluso si todavía no llegó a sincronizar.
    this.pendingSaleUuid ??= crypto.randomUUID();
    const orderUuid = this.pendingSaleUuid;

    if (!this.network.isOnline()) {
      this.offlineQueue.enqueueCreate(orderUuid, orderInput);
      this.clearCart();
      this.submitting.set(false);
      this.flashMessage(
        status === 'pending'
          ? 'Cuenta abierta localmente — se sincronizará al recuperar conexión'
          : 'Venta guardada localmente — se sincronizará al recuperar conexión',
      );
      return;
    }

    try {
      await this.orderService.registerOrder(orderInput, orderUuid);
      this.pendingSaleUuid = null;
      if (status === 'pending') {
        this.clearCart();
        await this.refreshPending();
        this.flashMessage('Cuenta abierta');
        this.submitting.set(false);
        return;
      }
      this.goBack();
    } catch (err: unknown) {
      this.formError.set(
        errorMessage(err, status === 'pending' ? 'Error al abrir la cuenta' : 'Error al procesar la venta'),
      );
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

  // ── Internos ────────────────────────────────────────────────────────────

  private selectedTableId(): string | null {
    const value = this.destination();
    return value && value !== TAKEAWAY_VALUE ? value : null;
  }

  private cartItems(): RegisterProductItem[] {
    return this.cart().map((item) => ({
      product_id: item.product_id,
      quantity:   item.quantity,
      unit_price: item.unit_price,
    }));
  }

  private itemsTotal(items: RegisterProductItem[]): number {
    return items.reduce((sum, i) => sum + i.unit_price * i.quantity, 0);
  }

  private summarizeItems(items: RegisterProductItem[]): string {
    const first = items[0];
    if (!first) return '—';
    const name = this.products().find((p) => p.id === first.product_id)?.name ?? 'Producto';
    const extra = items.length - 1;
    return extra > 0 ? `${name} (+${extra} más)` : name;
  }

  private destinationLabelFor(input: RegisterOrderInput): string {
    if (input.table_id) {
      return this.tables().find((t) => t.id === input.table_id)?.name ?? 'Mesa';
    }
    return input.is_takeaway ? 'Para llevar' : 'Sin mesa';
  }

  private flashMessage(message: string): void {
    this.queuedMessage.set(message);
    setTimeout(() => this.queuedMessage.set(null), 4000);
  }

  readonly TAKEAWAY_VALUE = TAKEAWAY_VALUE;
}
