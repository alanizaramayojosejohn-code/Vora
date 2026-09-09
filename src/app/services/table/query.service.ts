import { inject, Injectable } from '@angular/core';
import { compareTableNames, Table } from '../../models/table.model';
import { SupabaseService } from '../supabase/supabase.service';
import { TableCacheService } from '../offline/table-cache.service';

@Injectable({ providedIn: 'root' })
export class TableQueryService {
  private readonly client = inject(SupabaseService).client;
  private readonly cache = inject(TableCacheService);

  // RLS filtra por business_id. El orden se resuelve en el cliente porque
  // Postgres ordenaría "Mesa 10" antes que "Mesa 2".
  async listTables(): Promise<Table[]> {
    const { data, error } = await this.client.from('tables').select('*');
    if (error) throw error;
    const tables = (data ?? []) as Table[];
    tables.sort((a, b) => compareTableNames(a.name, b.name));
    return tables;
  }

  // Para el selector de la pantalla de venta: solo mesas activas y, sin
  // conexión, las últimas sincronizadas (RF-29).
  async listActiveTablesWithCache(): Promise<{ tables: Table[]; fromCache: boolean }> {
    try {
      const tables = (await this.listTables()).filter((t) => t.is_active);
      this.cache.save(tables);
      return { tables, fromCache: false };
    } catch (err) {
      const cached = await this.cache.load();
      if (cached) return { tables: cached, fromCache: true };
      throw err;
    }
  }
}
