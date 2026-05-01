import { inject, Injectable } from '@angular/core';
import { AttendanceWithDetails } from '../../models/attendance.model';
import { SupabaseService } from '../supabase/supabase.service';

interface AttendanceRow {
  id: string;
  business_id: string;
  client_id: string;
  client_membership_id: string | null;
  attended_at: string;
  clients: { ci: string; name: string } | null;
  client_memberships: { membership_plans: { name: string } | null } | null;
}

@Injectable({ providedIn: 'root' })
export class AttendanceQueryService {
  private readonly client = inject(SupabaseService).client;

  // RLS filtra por business_id del caller.
  async lastVisitByClientIds(clientIds: string[]): Promise<Map<string, string>> {
    if (clientIds.length === 0) return new Map();
    const { data, error } = await this.client
      .from('attendance')
      .select('client_id, attended_at')
      .in('client_id', clientIds)
      .order('attended_at', { ascending: false });
    if (error) throw error;
    const map = new Map<string, string>();
    for (const row of (data ?? []) as { client_id: string; attended_at: string }[]) {
      if (!map.has(row.client_id)) map.set(row.client_id, row.attended_at);
    }
    return map;
  }

  async listRecent(limit = 50): Promise<AttendanceWithDetails[]> {
    const { data, error } = await this.client
      .from('attendance')
      .select(`
        *,
        clients(ci, name),
        client_memberships(membership_plans(name))
      `)
      .order('attended_at', { ascending: false })
      .limit(limit);
    if (error) throw error;

    const rows = (data ?? []) as AttendanceRow[];
    return rows.map(({ clients, client_memberships, ...att }) => ({
      ...att,
      client_label: clients ? `${clients.ci} · ${clients.name}` : '—',
      plan_name: client_memberships?.membership_plans?.name ?? null,
    }));
  }
}
