import { Component, inject } from '@angular/core';
import { PwaInstallService } from '../../services/pwa/pwa-install.service';

@Component({
  selector: 'app-pwa-install-banner',
  template: `
    @if (pwa.canInstall()) {
      <div class="fixed bottom-0 left-0 right-0 z-50 p-3 sm:p-4 pwa-slide-up">
        <div class="max-w-sm mx-auto bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-700 rounded-2xl shadow-2xl overflow-hidden">

          <div class="flex items-center gap-3 px-4 pt-4 pb-3">
            <img src="img/logo_dark.png" class="w-11 h-11 rounded-xl object-contain bg-zinc-100 dark:bg-zinc-800 p-1 shrink-0" alt="Vora">
            <div class="min-w-0">
              <p class="font-semibold text-zinc-900 dark:text-white text-sm leading-tight">Vora</p>
              <p class="text-xs text-zinc-500 dark:text-zinc-400 leading-snug">
                Instala la app para acceso rápido sin navegador
              </p>
            </div>
          </div>

          @if (pwa.isIos()) {
            <div class="px-4 pb-4">
              <p class="text-xs text-zinc-600 dark:text-zinc-400 mb-3 leading-relaxed">
                Toca el botón
                <span class="inline-flex items-center gap-1 font-medium text-zinc-800 dark:text-zinc-200">
                  <svg class="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2"
                      d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-8l-4-4m0 0L8 8m4-4v12"/>
                  </svg>
                  Compartir
                </span>
                y luego
                <span class="font-medium text-zinc-800 dark:text-zinc-200">"Agregar a pantalla de inicio"</span>
              </p>
              <button
                (click)="pwa.dismiss()"
                class="w-full py-2 text-sm font-medium text-zinc-600 dark:text-zinc-400 hover:text-zinc-900 dark:hover:text-white transition-colors">
                Entendido
              </button>
            </div>
          } @else {
            <div class="flex border-t border-zinc-100 dark:border-zinc-800">
              <button
                (click)="pwa.dismiss()"
                class="flex-1 py-3 text-sm font-medium text-zinc-500 dark:text-zinc-400 hover:bg-zinc-50 dark:hover:bg-zinc-800 transition-colors">
                Ahora no
              </button>
              <div class="w-px bg-zinc-100 dark:bg-zinc-800"></div>
              <button
                (click)="pwa.install()"
                class="flex-1 py-3 text-sm font-semibold text-blue-600 dark:text-blue-400 hover:bg-blue-50 dark:hover:bg-zinc-800 transition-colors">
                Instalar
              </button>
            </div>
          }

        </div>
      </div>
    }
  `,
  styles: [`
    .pwa-slide-up {
      animation: pwa-slide-up 0.3s cubic-bezier(0.16, 1, 0.3, 1) both;
    }
    @keyframes pwa-slide-up {
      from { transform: translateY(100%); opacity: 0; }
      to   { transform: translateY(0);    opacity: 1; }
    }
  `],
})
export class PwaInstallBannerComponent {
  protected readonly pwa = inject(PwaInstallService);
}
