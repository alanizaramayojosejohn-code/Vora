import { ChangeDetectionStrategy, Component, inject } from '@angular/core';
import { SwUpdateService } from '../../services/pwa/sw-update.service';

// Aviso de versión nueva. Deliberadamente flotante y descartable: en caja no
// se puede recargar por sorpresa a alguien que está cobrando.
@Component({
  selector: 'app-sw-update-banner',
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    @if (sw.updateAvailable()) {
      <div class="fixed bottom-0 left-0 right-0 z-50 p-3 sm:p-4 sw-slide-up">
        <div class="max-w-sm mx-auto bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-700 rounded-2xl shadow-2xl overflow-hidden">

          <div class="flex items-center gap-3 px-4 pt-4 pb-3">
            <div class="w-11 h-11 rounded-xl shrink-0 flex items-center justify-center bg-blue-50 dark:bg-blue-500/10">
              <svg class="w-5 h-5 text-blue-600 dark:text-blue-400" fill="none" stroke="currentColor" viewBox="0 0 24 24"
                   stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                <path d="M21 2v6h-6"/><path d="M3 12a9 9 0 0 1 15-6.7L21 8"/>
                <path d="M3 22v-6h6"/><path d="M21 12a9 9 0 0 1-15 6.7L3 16"/>
              </svg>
            </div>
            <div class="min-w-0">
              <p class="font-semibold text-zinc-900 dark:text-white text-sm leading-tight">
                Hay una versión nueva
              </p>
              <p class="text-xs text-zinc-500 dark:text-zinc-400 leading-snug">
                Se aplica al recargar. Termina la venta en curso antes de actualizar.
              </p>
            </div>
          </div>

          <div class="flex border-t border-zinc-100 dark:border-zinc-800">
            <button type="button" (click)="sw.dismiss()" [disabled]="sw.applying()"
                    class="flex-1 py-3 text-sm font-medium text-zinc-500 dark:text-zinc-400
                           hover:bg-zinc-50 dark:hover:bg-zinc-800 transition-colors disabled:opacity-50">
              Ahora no
            </button>
            <div class="w-px bg-zinc-100 dark:bg-zinc-800"></div>
            <button type="button" (click)="sw.applyUpdate()" [disabled]="sw.applying()"
                    class="flex-1 py-3 text-sm font-semibold text-blue-600 dark:text-blue-400
                           hover:bg-blue-50 dark:hover:bg-zinc-800 transition-colors disabled:opacity-50">
              {{ sw.applying() ? 'Actualizando…' : 'Actualizar' }}
            </button>
          </div>

        </div>
      </div>
    }
  `,
  styles: [`
    .sw-slide-up {
      animation: sw-slide-up 0.3s cubic-bezier(0.16, 1, 0.3, 1) both;
    }
    @keyframes sw-slide-up {
      from { transform: translateY(100%); opacity: 0; }
      to   { transform: translateY(0);    opacity: 1; }
    }
  `],
})
export class SwUpdateBannerComponent {
  protected readonly sw = inject(SwUpdateService);
}
