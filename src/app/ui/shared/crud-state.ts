import { Signal, WritableSignal, computed, signal } from '@angular/core';
import { errorMessage } from '../../utilities/error-message';
import { initialsOrNull } from '../../utilities/initials';

// Entidad mínima que necesita el helper: id para editar/borrar, name para las
// iniciales del modal de borrado. Las 8 pantallas CRUD del panel (categorías,
// clientes, productos, personal, mesas, usuarios, proveedores, negocios)
// cumplen esto.
export interface CrudEntity {
  readonly id: string;
  readonly name: string;
}

// Mensajes de fallback para errorMessage() en cada operación. create/update
// son opcionales porque un par de pantallas (productos, negocios) arman su
// propio handleSubmit — ver más abajo — y nunca llaman al genérico.
export interface CrudLabels {
  readonly load: string;
  readonly create?: string;
  readonly update?: string;
  readonly remove: string;
}

export interface CrudStateConfig<T extends CrudEntity, TInput> {
  readonly list: () => Promise<T[]>;
  readonly create?: (input: TInput) => Promise<unknown>;
  readonly update?: (id: string, input: TInput) => Promise<unknown>;
  readonly remove: (id: string) => Promise<unknown>;
  readonly labels: CrudLabels;
  // Efecto extra tras un borrado exitoso, antes de refrescar. Hoy solo lo usa
  // Personal, para cerrar el panel de pagos si el empleado borrado era el
  // seleccionado — no encaja en ningún otro signal del helper.
  readonly onRemoved?: (item: T) => void;
}

export interface CrudState<T extends CrudEntity, TInput> {
  readonly items: WritableSignal<T[]>;
  readonly loading: WritableSignal<boolean>;
  readonly loadError: WritableSignal<string | null>;

  // Modo del form: null = oculto, 'create' = nuevo, T = editando ese item.
  readonly formState: WritableSignal<null | 'create' | T>;
  readonly editing: Signal<T | null>;
  readonly showForm: Signal<boolean>;
  readonly submitting: WritableSignal<boolean>;
  readonly formError: WritableSignal<string | null>;

  // Modal de borrado: null = cerrado, T = mostrando confirmación para ese item.
  readonly deleting: WritableSignal<T | null>;
  readonly deletingError: WritableSignal<string | null>;
  readonly deletingSubmitting: WritableSignal<boolean>;
  readonly deletingInitials: Signal<string | null>;

  refresh(): Promise<void>;
  openCreate(): void;
  openEdit(item: T): void;
  closeForm(): void;
  handleSubmit(input: TInput): Promise<void>;
  handleDelete(item: T): void;
  cancelDelete(): void;
  confirmDelete(): Promise<void>;
}

// Fábrica de estado CRUD compartido por los 8 contenedores admin/saas que
// listan-crean-editan-borran una entidad simple.
//
// Por qué fábrica y no clase base: con signals + inject() en standalone
// components, una clase base obliga a resolver el constructor del padre y
// termina peleando con OnPush; la composición ("this.crud = createCrudState(...)")
// no tiene ese problema y cada contenedor sigue siendo dueño de su propio
// `inject()`.
//
// Cubre SOLO lo que las 8 pantallas hacían idéntico. El estado propio de cada
// una (categorías del form de productos, pagos de personal, suscripciones de
// negocios, alta de usuarios) se queda en su contenedor: este helper no sabe
// que existen.
export function createCrudState<T extends CrudEntity, TInput>(
  config: CrudStateConfig<T, TInput>,
): CrudState<T, TInput> {
  const items = signal<T[]>([]);
  const loading = signal(false);
  const loadError = signal<string | null>(null);

  const formState = signal<null | 'create' | T>(null);
  const editing = computed<T | null>(() => {
    const s = formState();
    return s && s !== 'create' ? s : null;
  });
  const showForm = computed(() => formState() !== null);

  const submitting = signal(false);
  const formError = signal<string | null>(null);

  const deleting = signal<T | null>(null);
  const deletingError = signal<string | null>(null);
  const deletingSubmitting = signal(false);
  const deletingInitials = computed(() => initialsOrNull(deleting()?.name ?? null));

  async function refresh(): Promise<void> {
    loading.set(true);
    loadError.set(null);
    try {
      items.set(await config.list());
    } catch (err: unknown) {
      loadError.set(errorMessage(err, config.labels.load));
    } finally {
      loading.set(false);
    }
  }

  function openCreate(): void {
    formState.set('create');
    formError.set(null);
  }

  function openEdit(item: T): void {
    formState.set(item);
    formError.set(null);
  }

  function closeForm(): void {
    formState.set(null);
    formError.set(null);
  }

  async function handleSubmit(input: TInput): Promise<void> {
    submitting.set(true);
    formError.set(null);
    const current = editing();
    try {
      if (current) {
        if (!config.update) throw new Error('createCrudState: falta "update" en la configuración');
        await config.update(current.id, input);
      } else {
        if (!config.create) throw new Error('createCrudState: falta "create" en la configuración');
        await config.create(input);
      }
      formState.set(null);
      await refresh();
    } catch (err: unknown) {
      formError.set(
        errorMessage(err, current ? (config.labels.update ?? 'Error al guardar') : (config.labels.create ?? 'Error al crear')),
      );
    } finally {
      submitting.set(false);
    }
  }

  function handleDelete(item: T): void {
    deleting.set(item);
    deletingError.set(null);
  }

  function cancelDelete(): void {
    if (deletingSubmitting()) return;
    deleting.set(null);
    deletingError.set(null);
  }

  async function confirmDelete(): Promise<void> {
    const item = deleting();
    if (!item) return;
    deletingSubmitting.set(true);
    deletingError.set(null);
    try {
      await config.remove(item.id);
      if (editing()?.id === item.id) formState.set(null);
      config.onRemoved?.(item);
      deleting.set(null);
      await refresh();
    } catch (err: unknown) {
      deletingError.set(errorMessage(err, config.labels.remove));
    } finally {
      deletingSubmitting.set(false);
    }
  }

  return {
    items,
    loading,
    loadError,
    formState,
    editing,
    showForm,
    submitting,
    formError,
    deleting,
    deletingError,
    deletingSubmitting,
    deletingInitials,
    refresh,
    openCreate,
    openEdit,
    closeForm,
    handleSubmit,
    handleDelete,
    cancelDelete,
    confirmDelete,
  };
}
