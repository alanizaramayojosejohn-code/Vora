import { DestroyRef, Injectable, inject, signal } from '@angular/core';

// Refleja si el viewport está en el breakpoint desktop (`lg`, 1024px).
//
// Existe para poder marcar el sidebar como `inert` cuando el drawer móvil
// está cerrado -está fuera de pantalla pero seguiría siendo enfocable con
// Tab- sin romper el desktop: ahí el rail está siempre visible y jamás debe
// quedar inerte, aunque el signal `sidebarOpen` de cada shell valga false.
@Injectable({ providedIn: 'root' })
export class ViewportService {
  private readonly destroyRef = inject(DestroyRef);
  private readonly query = window.matchMedia('(min-width: 1024px)');

  readonly isDesktop = signal(this.query.matches);

  constructor() {
    const onChange = (event: MediaQueryListEvent): void => this.isDesktop.set(event.matches);
    this.query.addEventListener('change', onChange);
    this.destroyRef.onDestroy(() => this.query.removeEventListener('change', onChange));
  }
}
