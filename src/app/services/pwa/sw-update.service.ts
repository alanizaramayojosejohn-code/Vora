import { inject, Injectable, signal } from '@angular/core';
import { SwUpdate, VersionReadyEvent } from '@angular/service-worker';
import { filter } from 'rxjs/operators';
import { timer } from 'rxjs';

// Una tablet de caja instalada como PWA puede pasar semanas sin cerrar la
// pestaña. Sin estas comprobaciones periódicas, el service worker jamás se
// entera de que hay una versión nueva y el cajero se queda en la vieja
// indefinidamente después de cada deploy.
const FIRST_CHECK_MS = 60 * 1000;       // 1 min tras cargar
const CHECK_INTERVAL_MS = 30 * 60 * 1000; // luego cada 30 min

@Injectable({ providedIn: 'root' })
export class SwUpdateService {
  private readonly swUpdate = inject(SwUpdate);

  readonly updateAvailable = signal(false);
  readonly applying = signal(false);

  constructor() {
    // En desarrollo el SW no está registrado: no hay nada que vigilar.
    if (!this.swUpdate.isEnabled) return;

    this.swUpdate.versionUpdates
      .pipe(filter((e): e is VersionReadyEvent => e.type === 'VERSION_READY'))
      .subscribe(() => this.updateAvailable.set(true));

    // El SW quedó en un estado del que no puede salir (caché incompleta o
    // corrupta). Acá sí se recarga sin preguntar: la alternativa es una app
    // que no responde.
    this.swUpdate.unrecoverable.subscribe(() => document.location.reload());

    timer(FIRST_CHECK_MS, CHECK_INTERVAL_MS).subscribe(() => void this.check());
  }

  private async check(): Promise<void> {
    try {
      await this.swUpdate.checkForUpdate();
    } catch {
      // Sin conexión o servidor inalcanzable: se reintenta al próximo ciclo.
    }
  }

  // Nunca se llama sola. La recarga descarta el carrito en curso, así que el
  // momento lo elige el cajero. La cola offline sobrevive: vive en
  // localStorage, no en memoria.
  async applyUpdate(): Promise<void> {
    if (this.applying()) return;
    this.applying.set(true);
    try {
      await this.swUpdate.activateUpdate();
    } catch {
      // Si la activación falla, recargar igual toma la versión nueva.
    }
    document.location.reload();
  }

  dismiss(): void {
    this.updateAvailable.set(false);
  }
}
