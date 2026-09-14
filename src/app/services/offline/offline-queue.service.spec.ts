import { TestBed } from '@angular/core/testing';
import { beforeEach, describe, expect, it } from 'vitest';
import { RegisterOrderInput } from '../order/order.service';
import { OfflineQueueService, PendingOperation } from './offline-queue.service';
import { StorageEncryptionService } from './storage-encryption.service';

// Los mismos literales que usa el servicio (no exportados: son un detalle de
// implementación). Se repiten acá porque el test necesita simular storage
// viejo y corrupto, no porque haya que mantenerlos sincronizados a mano en
// código de producción.
const STORAGE_KEY = 'saas_offline_queue_v3';
const LEGACY_KEYS = ['saas_offline_queue_v1', 'saas_offline_queue_v2'];

// Doble de StorageEncryptionService. crypto.subtle no está garantizado en
// jsdom, así que en vez de pelear con WebCrypto real el cifrado acá es
// JSON.stringify/parse: lo que importa para estos tests es CUÁNDO se llama
// encrypt() y con qué datos, no que el texto resultante sea indescifrable.
class FakeStorageEncryptionService {
  isReady = true;

  // Cada llamada a encrypt() queda registrada acá, en orden.
  readonly encryptCalls: PendingOperation[][] = [];

  // Si se pisa con una función que rechaza, simula cuota excedida / fallo de
  // cifrado real.
  encryptImpl: ((data: PendingOperation[]) => Promise<string>) | null = null;

  private readonly resolvers: (() => void)[] = [];

  encrypt(data: PendingOperation[]): Promise<string> {
    this.encryptCalls.push(data);
    if (this.encryptImpl) return this.encryptImpl(data);
    // Por defecto la promesa queda pendiente hasta que el test la resuelva a
    // mano con resolveOldestEncrypt(): así se puede comprobar que la cola
    // nunca lanza un segundo encrypt() mientras el primero sigue en vuelo.
    return new Promise<string>((resolve) => {
      this.resolvers.push(() => resolve(JSON.stringify(data)));
    });
  }

  // Resuelve, en orden de llegada, el encrypt() pendiente más viejo.
  resolveOldestEncrypt(): void {
    const resolve = this.resolvers.shift();
    if (!resolve) throw new Error('no hay ningún encrypt() pendiente para resolver');
    resolve();
  }

  decrypt<T>(ciphertext: string): Promise<T> {
    return Promise.resolve(JSON.parse(ciphertext) as T);
  }
}

async function flushMicrotasks(times = 10): Promise<void> {
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

describe('OfflineQueueService', () => {
  let queue: OfflineQueueService;
  let encryption: FakeStorageEncryptionService;

  beforeEach(() => {
    localStorage.clear();
    encryption = new FakeStorageEncryptionService();
    TestBed.configureTestingModule({
      providers: [{ provide: StorageEncryptionService, useValue: encryption }],
    });
    queue = TestBed.inject(OfflineQueueService);
  });

  describe('enqueue*', () => {
    it('enqueueCreate asigna id, created_at y attempts=0', () => {
      const id = queue.enqueueCreate('order-1', orderInput());
      const [op] = queue.pending();

      expect(op.id).toBe(id);
      expect(op.id).toEqual(expect.any(String));
      expect(op.id.length).toBeGreaterThan(0);
      expect(op.created_at).toEqual(expect.any(String));
      expect(new Date(op.created_at).toString()).not.toBe('Invalid Date');
      expect(op.attempts).toBe(0);
      expect(op.last_error).toBeNull();
      expect(op.kind).toBe('create');
      expect(op.order_uuid).toBe('order-1');
    });

    it('enqueueAddItems y enqueueSettle también asignan los campos de la cola', () => {
      queue.enqueueAddItems('order-1', [{ product_id: 'p2', quantity: 2, unit_price: 5 }]);
      queue.enqueueSettle('order-1', [{ method: 'cash', amount: 10 }], 10, 'sesion-1');

      const [addItems, settle] = queue.pending();
      expect(addItems.attempts).toBe(0);
      expect(addItems.kind).toBe('add_items');
      expect(settle.attempts).toBe(0);
      expect(settle.kind).toBe('settle');
    });

    it('dos operaciones encoladas seguidas tienen ids distintos', () => {
      const id1 = queue.enqueueCreate('order-1', orderInput());
      const id2 = queue.enqueueCreate('order-2', orderInput());
      expect(id1).not.toBe(id2);
    });
  });

  describe('chains()', () => {
    it('agrupa por order_uuid, respeta el FIFO de cada pedido y el orden de apertura entre pedidos', () => {
      // Se abre primero el pedido A, después el B, y a A se le suma un ítem
      // después de que B ya existía: la cadena de A debe seguir apareciendo
      // primero (se abrió antes), y dentro de A el create debe ir antes que
      // el add_items (se encoló antes).
      const createA = queue.enqueueCreate('order-A', orderInput());
      const createB = queue.enqueueCreate('order-B', orderInput());
      const addItemsA = queue.enqueueAddItems('order-A', [
        { product_id: 'p2', quantity: 1, unit_price: 8 },
      ]);
      const settleB = queue.enqueueSettle('order-B', [{ method: 'cash', amount: 10 }], 10, null);

      const chains = queue.chains();

      expect(chains).toHaveLength(2);
      expect(chains[0].map((o) => o.id)).toEqual([createA, addItemsA]);
      expect(chains[1].map((o) => o.id)).toEqual([createB, settleB]);
    });
  });

  describe('removeOrderChain', () => {
    it('se lleva todas las operaciones del pedido y ninguna de otro', () => {
      queue.enqueueCreate('order-A', orderInput());
      queue.enqueueAddItems('order-A', [{ product_id: 'p2', quantity: 1, unit_price: 8 }]);
      const createB = queue.enqueueCreate('order-B', orderInput());

      queue.removeOrderChain('order-A');

      expect(queue.operationsFor('order-A')).toEqual([]);
      const remaining = queue.pending();
      expect(remaining).toHaveLength(1);
      expect(remaining[0].id).toBe(createB);
    });
  });

  describe('markAttempt', () => {
    it('incrementa attempts y guarda el último error', () => {
      const id = queue.enqueueCreate('order-1', orderInput());

      queue.markAttempt(id, 'timeout');
      expect(queue.pending()[0].attempts).toBe(1);
      expect(queue.pending()[0].last_error).toBe('timeout');

      queue.markAttempt(id, 'timeout otra vez');
      expect(queue.pending()[0].attempts).toBe(2);
      expect(queue.pending()[0].last_error).toBe('timeout otra vez');
    });
  });

  describe('loadFromStorage', () => {
    it('borra las claves legacy v1/v2', async () => {
      localStorage.setItem(LEGACY_KEYS[0], 'algo-viejo');
      localStorage.setItem(LEGACY_KEYS[1], 'algo-menos-viejo');

      await queue.loadFromStorage();

      expect(localStorage.getItem(LEGACY_KEYS[0])).toBeNull();
      expect(localStorage.getItem(LEGACY_KEYS[1])).toBeNull();
    });

    it('descarta el storage corrupto sin explotar y no deja nada pendiente', async () => {
      localStorage.setItem(STORAGE_KEY, '{esto no es json válido');

      await expect(queue.loadFromStorage()).resolves.toBeUndefined();

      expect(queue.pending()).toEqual([]);
      expect(localStorage.getItem(STORAGE_KEY)).toBeNull();
    });

    it('carga las operaciones guardadas cuando el storage es válido', async () => {
      const saved: PendingOperation[] = [
        {
          id: 'op-1',
          order_uuid: 'order-1',
          created_at: '2026-01-01T00:00:00.000Z',
          attempts: 0,
          last_error: null,
          kind: 'create',
          input: orderInput(),
        },
      ];
      localStorage.setItem(STORAGE_KEY, JSON.stringify(saved));

      await queue.loadFromStorage();

      expect(queue.pending()).toEqual(saved);
    });
  });

  // Tarea 1: fix de commit(). Antes, dos commits seguidos podían dejar
  // persistido un snapshot viejo si el primer encrypt() resolvía después del
  // segundo; y si no había clave de cifrado lista, o encrypt/setItem
  // fallaban, la cola quedaba solo en memoria sin avisar a nadie.
  describe('serialización de escrituras (fix de commit())', () => {
    it('no lanza un segundo encrypt() mientras el primero sigue sin resolver', async () => {
      queue.enqueueCreate('order-1', orderInput());
      await flushMicrotasks();
      expect(encryption.encryptCalls).toHaveLength(1);

      // Un segundo commit (via markAttempt) llega ANTES de que el primer
      // encrypt() haya resuelto.
      const id = queue.pending()[0].id;
      queue.markAttempt(id, 'error de red');
      await flushMicrotasks();

      // Todavía no debería haberse lanzado un segundo encrypt(): la
      // escritura anterior sigue en vuelo.
      expect(encryption.encryptCalls).toHaveLength(1);

      encryption.resolveOldestEncrypt();
      await flushMicrotasks();

      // Recién ahora, tras resolver la primera escritura, se lanza la
      // segunda con el estado más nuevo (con markAttempt ya aplicado).
      expect(encryption.encryptCalls).toHaveLength(2);
      expect(encryption.encryptCalls[1][0].attempts).toBe(1);
    });

    it('dos commits seguidos dejan persistido el estado NUEVO, no uno viejo', async () => {
      queue.enqueueCreate('order-1', orderInput());
      await flushMicrotasks();
      expect(encryption.encryptCalls).toHaveLength(1);

      // Segundo commit mientras el primero sigue sin resolver.
      queue.enqueueCreate('order-2', orderInput());
      await flushMicrotasks();
      expect(encryption.encryptCalls).toHaveLength(1); // aún no se lanzó el segundo

      // Resolvemos la primera escritura (snapshot de 1 operación).
      encryption.resolveOldestEncrypt();
      await flushMicrotasks();
      // La segunda escritura, con las 2 operaciones, se lanza sola.
      expect(encryption.encryptCalls).toHaveLength(2);
      encryption.resolveOldestEncrypt();
      await flushMicrotasks();

      const finalState = queue.pending();
      expect(finalState).toHaveLength(2);
      const persisted = localStorage.getItem(STORAGE_KEY);
      expect(persisted).not.toBeNull();
      expect(JSON.parse(persisted!)).toEqual(finalState);
    });

    it('prende persistError si no hay clave de cifrado lista y hay operaciones pendientes', async () => {
      encryption.isReady = false;

      queue.enqueueCreate('order-1', orderInput());
      await flushMicrotasks();

      expect(queue.persistError()).not.toBeNull();
      // La cola sigue viva en memoria (no se pierde la venta), solo no se
      // pudo guardar en disco.
      expect(queue.pending()).toHaveLength(1);
      expect(localStorage.getItem(STORAGE_KEY)).toBeNull();
    });

    it('prende persistError si encrypt() o localStorage fallan (ej. cuota excedida)', async () => {
      encryption.encryptImpl = () => Promise.reject(new Error('QuotaExceededError'));

      queue.enqueueCreate('order-1', orderInput());
      await flushMicrotasks();

      expect(queue.persistError()).not.toBeNull();
      expect(queue.pending()).toHaveLength(1);
    });

    it('apaga persistError cuando una escritura vuelve a andar', async () => {
      encryption.isReady = false;
      queue.enqueueCreate('order-1', orderInput());
      await flushMicrotasks();
      expect(queue.persistError()).not.toBeNull();
      expect(encryption.encryptCalls).toHaveLength(0); // sin clave lista, ni se intenta cifrar

      encryption.isReady = true;
      queue.enqueueCreate('order-2', orderInput());
      await flushMicrotasks();
      // El fake deja el encrypt() pendiente hasta que el test lo resuelve a mano.
      encryption.resolveOldestEncrypt();
      await flushMicrotasks();

      expect(queue.persistError()).toBeNull();
      expect(localStorage.getItem(STORAGE_KEY)).not.toBeNull();
    });
  });
});
