// Setup del entorno de tests. Se carga antes de cada archivo de spec via la
// opción `setupFiles` del builder @angular/build:unit-test en angular.json.

// jsdom no implementa window.matchMedia, y no es un detalle cosmético: tres
// lugares del arranque de la app lo llaman, dos de ellos desde el constructor
// de un servicio `providedIn: 'root'`.
//
//   theme.service.ts          → (prefers-color-scheme: dark)
//   pwa-install.service.ts    → (display-mode: standalone)
//   landing-backdrop.component.ts → (prefers-reduced-motion: reduce)
//
// Sin este stub, cualquier test que monte un componente que arrastre a
// PwaInstallService revienta en la resolución de dependencias, antes de
// evaluar nada. El error que se ve — "window.matchMedia is not a function" —
// no dice nada del componente bajo prueba.
//
// `matches: false` es el default deliberado: tema claro, ventana normal (no
// instalada como PWA) y sin reducción de movimiento. Un test que necesite el
// caso contrario debe stubear matchMedia él mismo.
function createMediaQueryList(query: string): MediaQueryList {
  // EventTarget real, para que addEventListener/removeEventListener funcionen
  // de verdad: theme.service registra un listener de 'change' y lo da de baja
  // al cambiar de modo, y un no-op ahí escondería una fuga de listeners.
  const target = new EventTarget();
  return {
    matches: false,
    media: query,
    onchange: null,
    addEventListener: target.addEventListener.bind(target),
    removeEventListener: target.removeEventListener.bind(target),
    dispatchEvent: target.dispatchEvent.bind(target),
    // API vieja de MediaQueryList: deprecada, pero sigue en el tipo de TS.
    addListener: () => undefined,
    removeListener: () => undefined,
  } as MediaQueryList;
}

if (typeof window !== 'undefined' && typeof window.matchMedia !== 'function') {
  Object.defineProperty(window, 'matchMedia', {
    writable: true,
    configurable: true,
    value: (query: string) => createMediaQueryList(query),
  });
}
