import { inject, Injectable, signal } from '@angular/core';
import {
  CashSession,
  CashSessionSummary,
  CashSessionWithCashier,
  CloseCashSessionResult,
} from '../../models/cash-session.model';
import { AuthService } from '../auth/auth.service';
import { SupabaseService } from '../supabase/supabase.service';

@Injectable({ providedIn: 'root' })
export class CashSessionService {
  private readonly client = inject(SupabaseService).client;
  private readonly auth = inject(AuthService);

  // Turno abierto del cajero actual. Lo lee la pantalla de venta para imputar
  // la venta al turno correcto, incluso si se cobró offline.
  readonly current = signal<CashSession | null>(null);

  async loadCurrent(): Promise<CashSession | null> {
    const userId = this.auth.session()?.user.id;
    if (!userId) return null;

    const { data, error } = await this.client
      .from('cash_sessions')
      .select('*')
      .eq('opened_by', userId)
      .eq('status', 'open')
      .maybeSingle();
    if (error) throw error;

    const session = (data as CashSession | null) ?? null;
    this.current.set(session);
    return session;
  }

  async open(openingFloat: number): Promise<CashSession | null> {
    const { error } = await this.client.rpc('open_cash_session', {
      p_opening_float: openingFloat,
    });
    if (error) throw error;
    return this.loadCurrent();
  }

  async summary(sessionId: string): Promise<CashSessionSummary> {
    const { data, error } = await this.client.rpc('cash_session_summary', {
      p_session_id: sessionId,
    });
    if (error) throw error;
    return data as CashSessionSummary;
  }

  async close(
    sessionId: string,
    countedCash: number,
    notes: string | null,
  ): Promise<CloseCashSessionResult> {
    const { data, error } = await this.client.rpc('close_cash_session', {
      p_session_id: sessionId,
      p_counted_cash: countedCash,
      p_notes: notes,
    });
    if (error) throw error;
    this.current.set(null);
    return data as CloseCashSessionResult;
  }

  // Historial para el reporte del admin. El FK de opened_by apunta a
  // auth.users, no a profiles, así que PostgREST no puede hacer el join solo:
  // se resuelven los nombres en una segunda consulta.
  async listSessions(limit = 60): Promise<CashSessionWithCashier[]> {
    const { data, error } = await this.client
      .from('cash_sessions')
      .select('*')
      .order('opened_at', { ascending: false })
      .limit(limit);
    if (error) throw error;

    const sessions = (data ?? []) as CashSession[];
    const ids = [...new Set(sessions.map((s) => s.opened_by).filter((id): id is string => !!id))];
    if (ids.length === 0) return sessions.map((s) => ({ ...s, cashier_name: null }));

    const { data: profiles, error: pErr } = await this.client
      .from('profiles')
      .select('id, name')
      .in('id', ids);
    if (pErr) throw pErr;

    const names = new Map((profiles ?? []).map((p: { id: string; name: string }) => [p.id, p.name]));
    return sessions.map((s) => ({
      ...s,
      cashier_name: s.opened_by ? names.get(s.opened_by) ?? null : null,
    }));
  }
}
