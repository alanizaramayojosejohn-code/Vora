import { inject, Injectable, signal } from '@angular/core';
import { PaymentLine } from '../../models/payment-split.model';
import { RegisterOrderInput, RegisterProductItem } from '../order/order.service';
import { StorageEncryptionService } from './storage-encryption.service';

// Una operación de la cola. `id` es la clave de idempotencia de la OPERACIÓN;
// `order_uuid` es la identidad del PEDIDO al que afecta.
//
// Que el pedido se referencie por su client_uuid y no por el id del servidor es
// lo que permite encolar "agregar ítems" o "saldar" sobre un pedido que todavía
// no existe en el servidor: nace recién cuando sincroniza el 'create' que va
// antes en la cadena (RF-21).
interface PendingOperationBase {
  id: string;
  order_uuid: string;
  created_at: string;
  attempts: number;
  last_error: string | null;
}

export interface CreateOperation extends PendingOperationBase {
  kind: 'create';
  input: RegisterOrderInput;
}

export interface AddItemsOperation extends PendingOperationBase {
  kind: 'add_items';
  items: RegisterProductItem[];
}

export interface SettleOperation extends PendingOperationBase {
  kind: 'settle';
  payments: PaymentLine[];
  expected_total: number;
  cash_session_id: string | null;
}

export type PendingOperation = CreateOperation | AddItemsOperation | SettleOperation;

// Una operación sin los campos que pone la cola. El condicional es para que el
// Omit se aplique a CADA variante: aplicado a la unión entera, TypeScript se
// queda solo con las claves comunes y `input`, `items` o `payments` dejarían
// de existir.
type NewOperation<T = PendingOperation> = T extends PendingOperation
  ? Omit<T, 'id' | 'created_at' | 'attempts' | 'last_error'>
  : never;

// v3: la cola dejó de ser una lista de ventas para ser una lista de operaciones.
// Igual que en el paso v1 → v2, la cola anterior se descarta en vez de
// migrarse: son ventas de un dispositivo que quedó sin sincronizar, y el
// formato viejo no tiene el order_uuid que necesita el nuevo.
const STORAGE_KEY = 'saas_offline_queue_v3';
const LEGACY_KEYS = ['saas_offline_queue_v1', 'saas_offline_queue_v2'];

@Injectable({ providedIn: 'root' })
export class OfflineQueueService {
  private readonly encryption = inject(StorageEncryptionService);
  readonly pending = signal<PendingOperation[]>([]);

  async loadFromStorage(): Promise<void> {
    for (const key of LEGACY_KEYS) localStorage.removeItem(key);
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      if (!raw) return;
      const operations = await this.encryption.decrypt<PendingOperation[]>(raw);
      this.pending.set(operations);
    } catch {
      localStorage.removeItem(STORAGE_KEY);
    }
  }

  clearStorage(): void {
    localStorage.removeItem(STORAGE_KEY);
    this.pending.set([]);
  }

  enqueueCreate(orderUuid: string, input: RegisterOrderInput): string {
    return this.enqueue({ kind: 'create', order_uuid: orderUuid, input });
  }

  enqueueAddItems(orderUuid: string, items: RegisterProductItem[]): string {
    return this.enqueue({ kind: 'add_items', order_uuid: orderUuid, items });
  }

  enqueueSettle(
    orderUuid: string,
    payments: PaymentLine[],
    expectedTotal: number,
    cashSessionId: string | null,
  ): string {
    return this.enqueue({
      kind: 'settle',
      order_uuid: orderUuid,
      payments,
      expected_total: expectedTotal,
      cash_session_id: cashSessionId,
    });
  }

  remove(id: string): void {
    this.commit(this.pending().filter((o) => o.id !== id));
  }

  // Al descartar un pedido se van también sus operaciones posteriores: sumarle
  // ítems o cobrar un pedido que nunca se va a crear no tiene sentido.
  removeOrderChain(orderUuid: string): void {
    this.commit(this.pending().filter((o) => o.order_uuid !== orderUuid));
  }

  markAttempt(id: string, error: string | null): void {
    this.commit(
      this.pending().map((o) =>
        o.id === id ? { ...o, attempts: o.attempts + 1, last_error: error } : o,
      ),
    );
  }

  operationsFor(orderUuid: string): PendingOperation[] {
    return this.pending().filter((o) => o.order_uuid === orderUuid);
  }

  // Cadenas FIFO por pedido (RF-22): las operaciones de un mismo pedido se
  // aplican en orden de creación y una falla frena solo a las de ESE pedido.
  // El Map conserva el orden de inserción, así que las cadenas salen en el
  // orden en que se abrió cada pedido.
  chains(): PendingOperation[][] {
    const groups = new Map<string, PendingOperation[]>();
    for (const op of this.pending()) {
      const chain = groups.get(op.order_uuid);
      if (chain) chain.push(op);
      else groups.set(op.order_uuid, [op]);
    }
    return [...groups.values()];
  }

  private enqueue(operation: NewOperation): string {
    const entry = {
      ...operation,
      id: crypto.randomUUID(),
      created_at: new Date().toISOString(),
      attempts: 0,
      last_error: null,
    } as PendingOperation;
    this.commit([...this.pending(), entry]);
    return entry.id;
  }

  private commit(operations: PendingOperation[]): void {
    this.pending.set(operations);
    if (!this.encryption.isReady) return;
    this.encryption
      .encrypt(operations)
      .then((encrypted) => localStorage.setItem(STORAGE_KEY, encrypted))
      .catch(() => { /* quota exceeded or encryption error */ });
  }
}
