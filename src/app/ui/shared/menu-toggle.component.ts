import { ChangeDetectionStrategy, Component, input, output } from '@angular/core';

// Botón del menú lateral en móvil. Las tres líneas se transforman en una X
// cuando el menú está abierto.
//
// Son tres <span> y no un SVG que se reemplaza: al intercambiar iconos el
// cambio es un corte seco, mientras que acá cada línea viaja a su posición
// final y se ve de dónde salió la X. Es el mismo elemento moviéndose, que es
// lo que hace que la transición se lea como una sola cosa.
//
// La línea del medio se desvanece y las otras dos se juntan en el centro
// antes de rotar: el retraso escalonado evita que las tres cosas pasen
// encima y el trazo quede embarullado a mitad de camino.
@Component({
  selector: 'app-menu-toggle',
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <button type="button" (click)="toggled.emit()"
            [attr.aria-expanded]="open()"
            [attr.aria-label]="open() ? 'Cerrar menú' : 'Abrir menú'"
            class="p-2 -ml-2 rounded-lg hover:bg-muted text-foreground-muted hover:text-foreground transition">
      <span class="relative block w-5 h-5">
        <span class="bar" [class.top]="true" [class.is-open]="open()"></span>
        <span class="bar" [class.mid]="true" [class.is-open]="open()"></span>
        <span class="bar" [class.bot]="true" [class.is-open]="open()"></span>
      </span>
    </button>
  `,
  styles: `
    .bar {
      position: absolute;
      left: 0;
      width: 100%;
      height: 2px;
      border-radius: 2px;
      background: currentColor;
      /* La posición viaja primero y la rotación después, para que las líneas
         se junten antes de cruzarse. Al cerrar el orden se invierte solo,
         porque los delays van en la clase de reposo. */
      transition:
        transform 220ms cubic-bezier(0.16, 1, 0.3, 1),
        top 180ms cubic-bezier(0.16, 1, 0.3, 1) 120ms,
        opacity 120ms ease-out 100ms;
    }

    .top { top: 4px; }
    .mid { top: 9px; }
    .bot { top: 14px; }

    .top.is-open,
    .bot.is-open {
      top: 9px;
      transition:
        top 180ms cubic-bezier(0.16, 1, 0.3, 1),
        transform 220ms cubic-bezier(0.16, 1, 0.3, 1) 120ms;
    }

    .top.is-open { transform: rotate(45deg); }
    .bot.is-open { transform: rotate(-45deg); }

    .mid.is-open {
      opacity: 0;
      transition: opacity 120ms ease-out;
    }
  `,
})
export class MenuToggleComponent {
  readonly open = input<boolean>(false);
  readonly toggled = output<void>();
}
