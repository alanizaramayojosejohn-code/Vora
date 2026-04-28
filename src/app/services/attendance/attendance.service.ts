import { inject, Injectable } from '@angular/core';
import { SupabaseService } from '../supabase/supabase.service';

@Injectable({ providedIn: 'root' })
export class AttendanceService {
  private readonly client = inject(SupabaseService).client;

  // RPC register_attendance: busca la membresía vigente del cliente,
  // descuenta una sesión si aplica, y registra la asistencia.
  async registerAttendance(clientId: string): Promise<string> {
    const { data, error } = await this.client.rpc('register_attendance', {
      p_client_id: clientId,
    });
    if (error) throw error;
    return data as string;
  }
}
