import {
  ChangeDetectionStrategy,
  Component,
  ElementRef,
  Input,
  OnDestroy,
  Output,
  EventEmitter,
  ViewChild,
  computed,
  effect,
  signal,
} from '@angular/core';

function hexToHsv(hex: string): [number, number, number] {
  const n = hex.toLowerCase().replace(/^#/, '');
  const r = parseInt(n.slice(0, 2), 16) / 255;
  const g = parseInt(n.slice(2, 4), 16) / 255;
  const b = parseInt(n.slice(4, 6), 16) / 255;
  const max = Math.max(r, g, b);
  const min = Math.min(r, g, b);
  const d = max - min;
  let h = 0;
  if (d > 0) {
    if (max === r) h = ((g - b) / d) % 6;
    else if (max === g) h = (b - r) / d + 2;
    else h = (r - g) / d + 4;
    h = Math.round(h * 60);
    if (h < 0) h += 360;
  }
  const s = max === 0 ? 0 : Math.round((d / max) * 100);
  const v = Math.round(max * 100);
  return [h, s, v];
}

function hsvToHex(h: number, s: number, v: number): string {
  const sv = s / 100, vv = v / 100;
  const c = vv * sv;
  const x = c * (1 - Math.abs(((h / 60) % 2) - 1));
  const m = vv - c;
  let r = 0, g = 0, b = 0;
  if (h < 60)       { r = c; g = x; b = 0; }
  else if (h < 120) { r = x; g = c; b = 0; }
  else if (h < 180) { r = 0; g = c; b = x; }
  else if (h < 240) { r = 0; g = x; b = c; }
  else if (h < 300) { r = x; g = 0; b = c; }
  else              { r = c; g = 0; b = x; }
  const toHex = (n: number) => Math.round((n + m) * 255).toString(16).padStart(2, '0');
  return `#${toHex(r)}${toHex(g)}${toHex(b)}`;
}

@Component({
  selector: 'app-hsv-picker',
  standalone: true,
  templateUrl: './hsv-picker.component.html',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class HsvPickerComponent implements OnDestroy {
  @Input({ required: true }) set value(hex: string) { this._valueIn.set(hex); }
  @Output() readonly valueChange = new EventEmitter<string>();

  @ViewChild('svPanel') private svPanel!: ElementRef<HTMLDivElement>;
  @ViewChild('hueBar')  private hueBar!:  ElementRef<HTMLDivElement>;

  private readonly _valueIn = signal('');
  private lastEmitted = '';
  private dragging: 'sv' | 'hue' | null = null;

  readonly h = signal(0);
  readonly s = signal(100);
  readonly v = signal(100);

  readonly currentHex = computed(() => hsvToHex(this.h(), this.s(), this.v()));
  readonly svBg       = computed(() =>
    `linear-gradient(to bottom, transparent, #000), ` +
    `linear-gradient(to right, #fff, hsl(${this.h()}, 100%, 50%))`
  );
  readonly hueColor   = computed(() => `hsl(${this.h()}, 100%, 50%)`);
  readonly cursorX    = computed(() => this.s());
  readonly cursorY    = computed(() => 100 - this.v());
  readonly hexDisplay = computed(() => this.currentHex().slice(1).toUpperCase());

  private readonly onMove = (e: MouseEvent) => this.handleMove(e);
  private readonly onUp   = () => this.stopDrag();

  constructor() {
    effect(() => {
      const hex = this._valueIn().toLowerCase();
      if (!hex || hex === this.lastEmitted) return;
      const [h, s, v] = hexToHsv(hex);
      this.h.set(h);
      this.s.set(s);
      this.v.set(v);
    }, { allowSignalWrites: true });
  }

  private emit(): void {
    const hex = this.currentHex();
    this.lastEmitted = hex.toLowerCase();
    this.valueChange.emit(hex);
  }

  // ── SV panel ───────────────────────────────────────────────────────────────
  onSvDown(e: MouseEvent): void {
    e.preventDefault();
    this.dragging = 'sv';
    this.moveSV(e);
    document.addEventListener('mousemove', this.onMove);
    document.addEventListener('mouseup', this.onUp);
  }

  private moveSV(e: MouseEvent): void {
    const rect = this.svPanel.nativeElement.getBoundingClientRect();
    this.s.set(Math.round(Math.max(0, Math.min(1, (e.clientX - rect.left) / rect.width))  * 100));
    this.v.set(Math.round((1 - Math.max(0, Math.min(1, (e.clientY - rect.top)  / rect.height))) * 100));
    this.emit();
  }

  // ── Hue bar ────────────────────────────────────────────────────────────────
  onHueDown(e: MouseEvent): void {
    e.preventDefault();
    this.dragging = 'hue';
    this.moveHue(e);
    document.addEventListener('mousemove', this.onMove);
    document.addEventListener('mouseup', this.onUp);
  }

  private moveHue(e: MouseEvent): void {
    const rect = this.hueBar.nativeElement.getBoundingClientRect();
    this.h.set(Math.round(Math.max(0, Math.min(1, (e.clientX - rect.left) / rect.width)) * 360));
    this.emit();
  }

  // ── Shared drag ────────────────────────────────────────────────────────────
  private handleMove(e: MouseEvent): void {
    if (this.dragging === 'sv')  this.moveSV(e);
    else if (this.dragging === 'hue') this.moveHue(e);
  }

  private stopDrag(): void {
    this.dragging = null;
    document.removeEventListener('mousemove', this.onMove);
    document.removeEventListener('mouseup', this.onUp);
  }

  // ── Numeric inputs ─────────────────────────────────────────────────────────
  onHInput(e: Event): void {
    this.h.set(Math.round(Math.max(0, Math.min(360, Number((e.target as HTMLInputElement).value)))));
    this.emit();
  }

  onSInput(e: Event): void {
    this.s.set(Math.round(Math.max(0, Math.min(100, Number((e.target as HTMLInputElement).value)))));
    this.emit();
  }

  onVInput(e: Event): void {
    this.v.set(Math.round(Math.max(0, Math.min(100, Number((e.target as HTMLInputElement).value)))));
    this.emit();
  }

  // ── Hex input ──────────────────────────────────────────────────────────────
  onHexInput(e: Event): void {
    const raw = (e.target as HTMLInputElement).value.replace(/[^0-9a-fA-F]/g, '');
    if (raw.length === 6) {
      const [h, s, v] = hexToHsv(`#${raw}`);
      this.h.set(h);
      this.s.set(s);
      this.v.set(v);
      this.emit();
    }
  }

  ngOnDestroy(): void {
    document.removeEventListener('mousemove', this.onMove);
    document.removeEventListener('mouseup', this.onUp);
  }
}
