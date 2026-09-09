import { ChangeDetectionStrategy, Component, computed, input, output, signal } from '@angular/core';
import { Table } from '../../../../../../models/table.model';
import { SkeletonRowsComponent } from '../../../../../shared/skeleton-rows.component';

@Component({
  selector: 'app-admin-tables-list',
  imports: [SkeletonRowsComponent],
  templateUrl: './list.html',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class TablesListComponent {
  readonly tables = input.required<Table[]>();
  // Ids de mesas con un pedido pendiente abierto: son las que no se pueden
  // desactivar ni eliminar (RF-3), y decirlo antes evita que el admin choque
  // con el error del servidor.
  readonly occupiedIds = input<string[]>([]);
  readonly loading = input<boolean>(false);
  readonly edit = output<Table>();
  readonly remove = output<Table>();

  readonly search = signal('');

  readonly activeCount = computed(() => this.tables().filter((t) => t.is_active).length);

  readonly filtered = computed<Table[]>(() => {
    const q = this.search().toLowerCase().trim();
    if (!q) return this.tables().slice();
    return this.tables().filter((t) => t.name.toLowerCase().includes(q));
  });

  isOccupied(table: Table): boolean {
    return this.occupiedIds().includes(table.id);
  }

  setSearch(v: string): void { this.search.set(v); }
}
