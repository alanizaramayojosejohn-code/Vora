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

// Mensaje único para las dos formas de no poder persistir: al cajero no le
// aporta nada distinguir "no está lista la clave" de "se llenó el storage",
// solo necesita saber que no debe cerrar la app ni el navegador todavía.
const PERSIST_ERROR_MESSAGE =
  'Hay ventas sin guardar en este dispositivo. No cierres la app hasta que se sincronicen.';

@Injectable({ providedIn: 'root' })
export class OfflineQueueService {
  private readonly encryption = inject(StorageEncryptionService);
  readonly pending = signal<PendingOperation[]>([]);

  // Se prende cuando la cola en memoria (this.pending) no coincide con lo
  // último que se logró escribir en localStorage: sin clave de cifrado lista,
  // o porque encrypt()/setItem() fallaron (típicamente cuota excedida). Un
  // refresh en ese estado pierde ventas reales, así que esto es lo que le
  // permite al cajero (vía offline-status.component) enterarse antes de que
  // pase.
  readonly persistError = signal<string | null>(null);

  // Serialización de escrituras a disco (fix de un bug real): dos commit()
  // seguidos antes de que la escritura anterior termine antes lanzaban dos
  // encrypt() en paralelo, y ganaba el que resolviera último — que podía ser
  // el estado VIEJO, dejando la cola persistida atrasada respecto de la cola
  // en memoria.
  //
  // Patrón: `writeInFlight` marca si hay una escritura corriendo; mientras
  // haya una, los commits que lleguen solo actualizan `latestSnapshot` (el
  // último gana, no se apilan). Al terminar la escritura en curso, el loop de
  // `drainPersist` relee `latestSnapshot`: si llegó algo más nuevo mientras
  // escribía, lo escribe también, sin crecer una cadena de promesas sin
  // límite (siempre hay como mucho una escritura en vuelo).
  private writeInFlight = false;
  private latestSnapshot: PendingOperation[] | null = null;

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
    // Con la cola vacía no queda nada que perder: si había un aviso de
    // persistencia colgado (p. ej. de la sesión anterior), no tiene sentido
    // seguir mostrándolo.
    this.persistError.set(null);
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
    this.schedulePersist(operations);
  }

  private schedulePersist(operations: PendingOperation[]): void {
    this.latestSnapshot = operations;
    // Ya hay una escritura en curso: cuando termine, drainPersist va a
    // recoger este snapshot (el más nuevo) en vez del que tenía cuando
    // arrancó. No hace falta lanzar otra escritura ahora.
    if (this.writeInFlight) return;
    this.writeInFlight = true;
    void this.drainPersist();
  }

  private async drainPersist(): Promise<void> {
    while (this.latestSnapshot !== null) {
      const snapshot = this.latestSnapshot;
      this.latestSnapshot = null;
      await this.persistSnapshot(snapshot);
    }
    this.writeInFlight = false;
  }

  private async persistSnapshot(operations: PendingOperation[]): Promise<void> {
    if (!this.encryption.isReady) {
      // Antes esto dejaba la cola SOLO en memoria en silencio: un refresh acá
      // perdía ventas reales sin que nadie se enterara. Si no hay nada
      // pendiente no hay nada que perder, así que no hace falta alarmar.
      this.persistError.set(operations.length > 0 ? PERSIST_ERROR_MESSAGE : null);
      return;
    }
    try {
      const encrypted = await this.encryption.encrypt(operations);
      localStorage.setItem(STORAGE_KEY, encrypted);
      this.persistError.set(null);
    } catch {
      // Cuota excedida o fallo de cifrado. Antes el catch se lo tragaba
      // (comentario original: "quota exceeded or encryption error") y nadie
      // se enteraba de que la cola había dejado de guardarse.
      this.persistError.set(PERSIST_ERROR_MESSAGE);
    }
  }
}
