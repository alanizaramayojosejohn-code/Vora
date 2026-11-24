import { TestBed } from '@angular/core/testing';
import { beforeEach, describe, expect, it } from 'vitest';
import { PaymentLine } from '../../models/payment-split.model';
import { NetworkService } from '../network/network.service';
import {
  OrderOperationResult,
  OrderRef,
  OrderService,
  RegisterOrderInput,
  RegisterProductItem,
} from '../order/order.service';
import { OfflineQueueService } from './offline-queue.service';
import { StorageEncryptionService } from './storage-encryption.service';
import { SyncService } from './sync.service';

// Mismo doble que en offline-queue.service.spec.ts: crypto.subtle no está
// garantizado en jsdom, así que el "cifrado" acá es JSON.stringify/parse.
class FakeStorageEncryptionService {
  isReady = true;
  encrypt(data: unknown): Promise<string> {
    return Promise.resolve(JSON.stringify(data));
  }
  decrypt<T>(ciphertext: string): Promise<T> {
    return Promise.resolve(JSON.parse(ciphertext) as T);
  }
}

// Doble de OrderService ("el servidor"). Cada método delega en un *Impl
// configurable por test (éxito inmediato por default) y deja registrado cada
// llamada, en orden, para poder comprobar la secuencia real en que SyncService
// aplicó la cadena.
class FakeOrderService {
  readonly callOrder: string[] = [];
  readonly registerCalls: { input: RegisterOrderInput; clientUuid: string }[] = [];
  readonly addItemsCalls: { operationUuid: string; order: OrderRef; items: RegisterProductItem[] }[] = [];
  readonly settleCalls: {
    operationUuid: string;
    order: OrderRef;
    payments: PaymentLine[];
    expectedTotal: number;
    cashSessionId: string | null;
  }[] = [];

  registerOrderImpl: (input: RegisterOrderInput, clientUuid: string) => Promise<string> = (
    _input,
    clientUuid,
  ) => Promise.resolve(clientUuid);

  addItemsImpl: (
    operationUuid: string,
    order: OrderRef,
    items: RegisterProductItem[],
  ) => Promise<OrderOperationResult> = () =>
    Promise.resolve({ order_id: 'srv-1', total_amount: 0, already_applied: false });

  settleImpl: (
    operationUuid: string,
    order: OrderRef,
    payments: PaymentLine[],
    expectedTotal: number,
    cashSessionId: string | null,
  ) => Promise<OrderOperationResult> = () =>
    Promise.resolve({ order_id: 'srv-1', total_amount: 0, already_applied: false });

  registerOrder(input: RegisterOrderInput, clientUuid: string): Promise<string> {
    this.callOrder.push(`create:${clientUuid}`);
    this.registerCalls.push({ input, clientUuid });
    return this.registerOrderImpl(input, clientUuid);
  }

  addItems(
    operationUuid: string,
    order: OrderRef,
    items: RegisterProductItem[],
  ): Promise<OrderOperationResult> {
    this.callOrder.push(`add_items:${order.uuid}`);
    this.addItemsCalls.push({ operationUuid, order, items });
    return this.addItemsImpl(operationUuid, order, items);
  }

  settleOrder(
    operationUuid: string,
    order: OrderRef,
    payments: PaymentLine[],
    expectedTotal: number,
    cashSessionId: string | null,
  ): Promise<OrderOperationResult> {
    this.callOrder.push(`settle:${order.uuid}`);
    this.settleCalls.push({ operationUuid, order, payments, expectedTotal, cashSessionId });
    return this.settleImpl(operationUuid, order, payments, expectedTotal, cashSessionId);
  }

  cancelOrder(): Promise<void> {
    return Promise.resolve();
  }
}

async function flushMicrotasks(times = 30): Promise<void> {
  for (let i = 0; i < times; i++) await Promise.resolve();
}

function orderInput(overrides: Partial<RegisterOrderInput> = {}): RegisterOrderInput {
  return {
    client_id: null,
    payment_method: 'cash',
    items: [{ product_id: 'prod-1', quantity: 1, unit_price: 10 }],
    ...overrides,
  };
}

describe('SyncService', () => {
  let sync: SyncService;
  let queue: OfflineQueueService;
  let network: NetworkService;
  let orders: FakeOrderService;

  beforeEach(() => {
    localStorage.clear();
    orders = new FakeOrderService();
    TestBed.configureTestingModule({
      providers: [
        { provide: StorageEncryptionService, useValue: new FakeStorageEncryptionService() },
        { provide: OrderService, useValue: orders },
      ],
    });
    queue = TestBed.inject(OfflineQueueService);
    network = TestBed.inject(NetworkService);
    sync = TestBed.inject(SyncService);
    network.isOnline.set(true);
  });

  it('aplica una cadena en orden y va removiendo las operaciones a medida que sincronizan', async () => {
    queue.enqueueCreate('order-1', orderInput());
    queue.enqueueAddItems('order-1', [{ product_id: 'p2', quantity: 1, unit_price: 5 }]);
    queue.enqueueSettle('order-1', [{ method: 'cash', amount: 15 }], 15, null);

    await sync.syncNow();
    await flushMicrotasks();

    expect(orders.callOrder).toEqual(['create:order-1', 'add_items:order-1', 'settle:order-1']);
    expect(queue.pending()).toEqual([]);
  });

  it('si falla la cabecera de una cadena, el resto de ESA cadena no se intenta pero otras cadenas siguen (RF-22)', async () => {
    queue.enqueueCreate('order-A', orderInput());
    queue.enqueueAddItems('order-A', [{ product_id: 'p2', quantity: 1, unit_price: 5 }]);
    queue.enqueueCreate('order-B', orderInput());

    orders.registerOrderImpl = (_input, clientUuid) => {
      if (clientUuid === 'order-A') return Promise.reject(new Error('fallo de red'));
      return Promise.resolve(clientUuid);
    };

    await sync.syncNow();
    await flushMicrotasks();

    // La cadena de B no se frenó por el fallo de A.
    expect(orders.registerCalls.map((c) => c.clientUuid)).toEqual(['order-A', 'order-B']);
    expect(queue.operationsFor('order-B')).toEqual([]);

    // La cabecera de A quedó marcada como intento fallido, y su add_items
    // JAMÁS se intentó (ni siquiera para fallar): sigue con attempts=0.
    expect(orders.addItemsCalls).toHaveLength(0);
    const remainingA = queue.operationsFor('order-A');
    expect(remainingA).toHaveLength(2);
    expect(remainingA[0].kind).toBe('create');
    expect(remainingA[0].attempts).toBe(1);
    expect(remainingA[0].last_error).toBe('fallo de red');
    expect(remainingA[1].kind).toBe('add_items');
    expect(remainingA[1].attempts).toBe(0);
  });

  it('un error con código permanente (VORA7/VORA8) descarta la operación y la manda a rejected', async () => {
    queue.enqueueSettle('order-1', [{ method: 'cash', amount: 10 }], 10, null);
    orders.settleImpl = () =>
      Promise.reject(Object.assign(new Error('la cuenta ya se cobró'), { code: 'VORA7' }));

    await sync.syncNow();
    await flushMicrotasks();

    expect(queue.pending()).toEqual([]);
    expect(sync.rejected()).toHaveLength(1);
    expect(sync.rejected()[0].message).toBe('la cuenta ya se cobró');
    // Un descarte permanente no es un error de sincronización a reintentar.
    expect(sync.syncErrors()).toEqual([]);
  });

  it('un error transitorio deja la operación en la cola marcada con markAttempt', async () => {
    queue.enqueueCreate('order-1', orderInput());
    orders.registerOrderImpl = () => Promise.reject(new Error('timeout'));

    await sync.syncNow();
    await flushMicrotasks();

    const [op] = queue.pending();
    expect(op.attempts).toBe(1);
    expect(op.last_error).toBe('timeout');
    expect(sync.syncErrors()).toHaveLength(1);
    expect(sync.rejected()).toEqual([]);
  });

  it('retryFailed vuelve a habilitar los intentos de lo que había fallado en la sesión', async () => {
    queue.enqueueCreate('order-1', orderInput());
    orders.registerOrderImpl = () => Promise.reject(new Error('timeout'));

    await sync.syncNow();
    await flushMicrotasks();
    expect(orders.registerCalls).toHaveLength(1);

    // Sin retryFailed, un segundo syncNow() no reintenta lo que ya falló en
    // esta sesión de conexión (attemptedIds lo sigue bloqueando).
    await sync.syncNow();
    await flushMicrotasks();
    expect(orders.registerCalls).toHaveLength(1);

    // Ahora el servidor "se recupera": retryFailed debe volver a intentarlo.
    orders.registerOrderImpl = (_input, clientUuid) => Promise.resolve(clientUuid);
    sync.retryFailed();
    await flushMicrotasks();

    expect(orders.registerCalls).toHaveLength(2);
    expect(queue.pending()).toEqual([]);
    expect(sync.syncErrors()).toEqual([]);
  });
});
