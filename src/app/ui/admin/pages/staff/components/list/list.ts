import { DatePipe, CurrencyPipe } from '@angular/common';
import {
  ChangeDetectionStrategy,
  Component,
  computed,
  input,
  output,
  signal,
} from '@angular/core';
import { Employee } from '../../../../../../models/employee.model';
import { SkeletonRowsComponent } from '../../../../../shared/skeleton-rows.component';

@Component({
  selector: 'app-admin-staff-list',
  imports: [SkeletonRowsComponent, DatePipe, CurrencyPipe],
  templateUrl: './list.html',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class StaffListComponent {
  readonly employees = input<Employee[]>([]);
  readonly loading = input<boolean>(false);

  readonly edit = output<Employee>();
  readonly remove = output<Employee>();
  readonly payments = output<Employee>();

  readonly search = signal('');
  readonly sortMenuOpen = signal(false);
  readonly sort = signal<'name' | 'salary' | 'hired'>('name');

  readonly sortLabel = computed(() => {
    switch (this.sort()) {
      case 'salary': return 'Sueldo ↓';
      case 'hired': return 'Ingreso reciente';
      default: return 'Nombre A→Z';
    }
  });

  readonly filteredSorted = computed(() => {
    const q = this.search().toLowerCase();
    let list = this.employees().filter(
      (e) =>
        e.name.toLowerCase().includes(q) ||
        e.ci.toLowerCase().includes(q) ||
        e.position.toLowerCase().includes(q),
    );
    switch (this.sort()) {
      case 'salary':
        list = [...list].sort((a, b) => b.salary - a.salary);
        break;
      case 'hired':
        list = [...list].sort((a, b) => b.hired_at.localeCompare(a.hired_at));
        break;
      default:
        list = [...list].sort((a, b) => a.name.localeCompare(b.name));
    }
    return list;
  });

  setSearch(v: string): void { this.search.set(v); }
  setSort(v: 'name' | 'salary' | 'hired'): void {
    this.sort.set(v);
    this.sortMenuOpen.set(false);
  }
  toggleSortMenu(): void { this.sortMenuOpen.update((o) => !o); }

  initials(name: string): string {
    const parts = name.trim().split(/\s+/).filter(Boolean);
    if (parts.length === 0) return '?';
    if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
    return (parts[0][0] + parts[1][0]).toUpperCase();
  }
}
