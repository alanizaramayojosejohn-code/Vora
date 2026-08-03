import { CurrencyPipe, DatePipe } from '@angular/common';
import { ChangeDetectionStrategy, Component, computed, input } from '@angular/core';
import { CashSessionWithCashier, differenceLabel } from '../../../../../../models/cash-session.model';

@Component({
  selector: 'app-cash-sessions-report',
  imports: [CurrencyPipe, DatePipe],
  templateUrl: './cash-sessions.html',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class CashSessionsReportComponent {
  readonly sessions = input.required<CashSessionWithCashier[]>();
  readonly loading  = input<boolean>(false);

  protected readonly differenceLabel = differenceLabel;

  protected readonly closed = computed(() =>
    this.sessions().filter((s) => s.status === 'closed' && s.difference !== null),
  );

  // Acumulado de faltantes: el número que el dueño quiere ver de un vistazo.
  protected readonly totalShortfall = computed(() =>
    this.closed()
      .filter((s) => (s.difference ?? 0) < 0)
      .reduce((acc, s) => acc + (s.difference ?? 0), 0),
  );

  protected readonly shortfallCount = computed(
    () => this.closed().filter((s) => (s.difference ?? 0) < 0).length,
  );

  protected differenceClass(difference: number | null): string {
    if (difference === null) return 'text-foreground-muted';
    if (difference === 0) return 'text-success';
    return difference > 0 ? 'text-warning' : 'text-danger';
  }
}
