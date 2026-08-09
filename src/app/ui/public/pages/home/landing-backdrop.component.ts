import {
  ChangeDetectionStrategy,
  Component,
  DestroyRef,
  ElementRef,
  afterNextRender,
  inject,
  viewChild,
} from '@angular/core';

/* =====================================================================
   Fondo animado del landing.

   Es una matriz de puntos —no partículas sueltas ni líneas conectadas—
   iluminada por dos focos que orbitan muy lento, más una onda diagonal
   que la recorre. La retícula da orden y precisión; la luz que se mueve
   por encima es lo único que cambia. Encaja con el producto: una
   herramienta, no un salvapantallas.

   Decisiones de implementación que importan:

   - Los puntos se agrupan por nivel de brillo en unos pocos `Path2D`
     (BUCKETS). Sin eso serían ~1.700 cambios de `fillStyle` y ~1.700
     `fill()` por cuadro; así son doce. En la tablet del cajero la
     diferencia se nota.
   - La caída de luz usa distancia al cuadrado, sin `Math.hypot`: la raíz
     no aporta nada visual acá y se ejecuta miles de veces por cuadro.
   - El tiempo se acumula a mano (`elapsed`) en vez de leerse del reloj.
     Al pausar y reanudar —pestaña oculta, sección fuera de pantalla— la
     animación continúa donde iba en vez de saltar.
   - Con `prefers-reduced-motion` se dibuja un solo cuadro y no se abre
     el bucle. La retícula sigue ahí, quieta.
   ===================================================================== */

/** Separación entre puntos, en px de CSS. */
const SPACING = 30;

/** Niveles de brillo. Cada uno es un solo `fill()` por cuadro. */
const BUCKETS = 12;

@Component({
  selector: 'app-landing-backdrop',
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `<canvas #canvas aria-hidden="true"></canvas>`,
  styles: `
    :host {
      position: fixed;
      inset: 0;
      z-index: 0;
      pointer-events: none;
      overflow: hidden;
    }

    canvas {
      display: block;
      width: 100%;
      height: 100%;
      /* La retícula acompaña, no compite con el texto que va encima. */
      opacity: 0.85;
    }
  `,
})
export class LandingBackdropComponent {
  private readonly canvasRef =
    viewChild.required<ElementRef<HTMLCanvasElement>>('canvas');

  private readonly host = inject(ElementRef<HTMLElement>);
  private readonly destroyRef = inject(DestroyRef);

  constructor() {
    afterNextRender(() => this.run());
  }

  private run(): void {
    const canvas = this.canvasRef().nativeElement;
    const ctx = canvas.getContext('2d', { alpha: true });
    if (!ctx) return;

    const reducedMotion = matchMedia('(prefers-reduced-motion: reduce)');

    let width = 0;
    let height = 0;
    let elapsed = 0;
    let lastTs = 0;
    let rafId = 0;
    let visible = true;

    const draw = (t: number) => {
      ctx.clearRect(0, 0, width, height);

      // Dos focos con períodos distintos y sin múltiplo común: el patrón
      // no se repite de forma reconocible aunque uno se quede mirando.
      const light1X = width * (0.5 + 0.3 * Math.cos(t * 0.07));
      const light1Y = height * (0.4 + 0.2 * Math.sin(t * 0.09));
      const light2X = width * (0.5 + 0.36 * Math.cos(t * 0.05 + 2.4));
      const light2Y = height * (0.6 + 0.24 * Math.sin(t * 0.06 + 1.1));

      // Radio de alcance en unidades al cuadrado, para comparar contra
      // distancias al cuadrado sin sacar raíz. Corto a propósito: si la luz
      // llega a todos lados la retícula queda plana y deja de leerse que
      // hay algo moviéndose.
      const reach = Math.max(width, height) * 0.5;
      const reachSq = reach * reach;

      const cols = Math.ceil(width / SPACING) + 1;
      const rows = Math.ceil(height / SPACING) + 1;
      const originX = (width - (cols - 1) * SPACING) / 2;
      const originY = (height - (rows - 1) * SPACING) / 2;

      const paths: Path2D[] = [];
      for (let i = 0; i < BUCKETS; i++) paths.push(new Path2D());

      for (let row = 0; row < rows; row++) {
        const y = originY + row * SPACING;

        for (let col = 0; col < cols; col++) {
          const x = originX + col * SPACING;

          const dx1 = x - light1X;
          const dy1 = y - light1Y;
          const dx2 = x - light2X;
          const dy2 = y - light2Y;

          const near1 = Math.max(0, 1 - (dx1 * dx1 + dy1 * dy1) / reachSq);
          const near2 = Math.max(0, 1 - (dx2 * dx2 + dy2 * dy2) / reachSq);

          // Onda diagonal: cruza la pantalla de arriba-izquierda a
          // abajo-derecha y evita que los focos se lean como dos manchas.
          const wave = Math.sin((x + y) * 0.0055 - t * 0.75);

          const level =
            0.06 + near1 * near1 * 0.8 + near2 * near2 * 0.55 + wave * 0.1;

          if (level <= 0.08) continue;

          const bucket = Math.min(BUCKETS - 1, Math.floor(level * BUCKETS));
          const radius = 0.65 + (bucket / (BUCKETS - 1)) * 1.25;

          const path = paths[bucket];
          path.moveTo(x + radius, y);
          path.arc(x, y, radius, 0, Math.PI * 2);
        }
      }

      for (let i = 0; i < BUCKETS; i++) {
        const p = i / (BUCKETS - 1);

        // De gris frío a un celeste apenas insinuado: es el lado azul del
        // logo, no un acento nuevo.
        const r = Math.round(140 + 46 * p);
        const g = Math.round(154 + 76 * p);
        const b = Math.round(176 + 77 * p);
        // Cuadrática: los puntos de la periferia quedan casi invisibles y
        // el salto de brillo se concentra donde está la luz.
        const alpha = 0.04 + p * p * 0.66;

        ctx.fillStyle = `rgba(${r}, ${g}, ${b}, ${alpha})`;
        ctx.fill(paths[i]);
      }
    };

    const resize = () => {
      const rect = this.host.nativeElement.getBoundingClientRect();
      // Más de 2x no se distingue y cuadruplica los píxeles a pintar.
      const dpr = Math.min(window.devicePixelRatio || 1, 2);

      width = Math.max(1, Math.round(rect.width));
      height = Math.max(1, Math.round(rect.height));
      canvas.width = Math.round(width * dpr);
      canvas.height = Math.round(height * dpr);
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);

      draw(elapsed);
    };

    const tick = (ts: number) => {
      elapsed += (ts - lastTs) / 1000;
      lastTs = ts;
      draw(elapsed);
      rafId = requestAnimationFrame(tick);
    };

    const stop = () => {
      if (!rafId) return;
      cancelAnimationFrame(rafId);
      rafId = 0;
    };

    const play = () => {
      if (rafId || !visible || reducedMotion.matches) return;
      lastTs = performance.now();
      rafId = requestAnimationFrame(tick);
    };

    // Nada de gastar batería con la pestaña en segundo plano.
    const onVisibility = () => {
      visible = !document.hidden;
      if (visible) play();
      else stop();
    };

    const onMotionChange = () => {
      stop();
      if (reducedMotion.matches) draw(elapsed);
      else play();
    };

    const observer = new ResizeObserver(() => resize());
    observer.observe(this.host.nativeElement);

    document.addEventListener('visibilitychange', onVisibility);
    reducedMotion.addEventListener('change', onMotionChange);

    resize();
    play();

    this.destroyRef.onDestroy(() => {
      stop();
      observer.disconnect();
      document.removeEventListener('visibilitychange', onVisibility);
      reducedMotion.removeEventListener('change', onMotionChange);
    });
  }
}
