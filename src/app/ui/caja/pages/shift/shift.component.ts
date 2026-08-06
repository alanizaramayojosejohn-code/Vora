import { CurrencyPipe, DatePipe } from '@angular/common';
import { ChangeDetectionStrategy, Component, computed, inject, OnInit, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import {
  CashSessionSummary,
  CloseCashSessionResult,
  differenceLabel,
} from '../../../../models/cash-session.model';
import { CashSessionService } from '../../../../services/cash-session/cash-session.service';
import { SubscriptionStateService } from '../../../../services/subscription/subscription-state.service';
import { errorMessage } from '../../../../utilities/error-message';

@Component({
  selector: 'app-caja-shift',
  imports: [FormsModule, CurrencyPipe, DatePipe],
  templateUrl: './shift.component.html',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class CajaShiftComponent implements OnInit {
  private readonly sessions = inject(CashSessionService);
  private readonly subscriptionState = inject(SubscriptionStateService);

  // Abrir y cerrar turno son escrituras: quedan fuera en modo solo lectura.
  protected readonly readonlyMode = computed(
    () => this.subscriptionState.status()?.isBlocked ?? false,
  );

  protected readonly current = this.sessions.current;
  protected readonly summary = signal<CashSessionSummary | null>(null);
  protected readonly result  = signal<CloseCashSessionResult | null>(null);

  protected readonly loading    = signal(true);
  protected readonly submitting = signal(false);
  protected readonly error      = signal<string | null>(null);

  protected openingFloat = 0;
  protected countedCash: number | null = null;
  protected closingNotes = '';

  protected readonly differenceLabel = differenceLabel;

  protected readonly hasOpenSession = computed(() => this.current() !== null);

  // Método y no computed(): `countedCash` es una propiedad de ngModel, no una
  // señal, así que un computed() no se recalcularía al escribir y el botón se
  // quedaría deshabilitado.
  protected canClose(): boolean {
    return this.countedCash !== null
      && this.countedCash >= 0
      && !this.submitting()
      && !this.readonlyMode();
  }

  async ngOnInit(): Promise<void> {
    await this.refresh();
  }

  private async refresh(): Promise<void> {
    this.loading.set(true);
    this.error.set(null);
    try {
      const session = await this.sessions.loadCurrent();
      this.summary.set(session ? await this.sessions.summary(session.id) : null);
    } catch (err: unknown) {
      this.error.set(errorMessage(err, 'Error al cargar el turno'));
    } finally {
      this.loading.set(false);
    }
  }

  async openShift(): Promise<void> {
    if (this.submitting()) return;
    this.submitting.set(true);
    this.error.set(null);
    try {
      await this.sessions.open(Math.max(0, this.openingFloat || 0));
      this.result.set(null);
      await this.refresh();
    } catch (err: unknown) {
      this.error.set(errorMessage(err, 'Error al abrir la caja'));
    } finally {
      this.submitting.set(false);
    }
  }

  async closeShift(): Promise<void> {
    const session = this.current();
    if (!session || !this.canClose()) return;

    this.submitting.set(true);
    this.error.set(null);
    try {
      const result = await this.sessions.close(
        session.id,
        this.countedCash ?? 0,
        this.closingNotes.trim() || null,
      );
      this.result.set(result);
      this.summary.set(null);
      this.countedCash = null;
      this.closingNotes = '';
      this.openingFloat = 0;
    } catch (err: unknown) {
      this.error.set(errorMessage(err, 'Error al cerrar la caja'));
    } finally {
      this.submitting.set(false);
    }
  }

  dismissResult(): void {
    this.result.set(null);
  }
}
