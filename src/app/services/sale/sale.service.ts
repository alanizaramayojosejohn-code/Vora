import { inject, Injectable } from '@angular/core';
import { SupabaseService } from '../supabase/supabase.service';

export interface RegisterSaleProductInput {
  product_id: string;
  quantity: number;
  client_id: string | null;
}

@Injectable({ providedIn: 'root' })
export class SaleService {
  private readonly client = inject(SupabaseService).client;
}
