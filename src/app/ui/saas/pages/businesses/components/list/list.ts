import { ChangeDetectionStrategy, Component, computed, input, output, signal } from '@angular/core';
import { DatePipe } from '@angular/common';
import { Business } from '../../../../../../models/business.model';
import { contrastColor, getPreset } from '../../../../../../services/theme/theme.presets';
import { SkeletonRowsComponent } from '../../../../../shared/skeleton-rows.component';

type BusinessSort = 'name' | 'created' | 'preset';

@Component({
  selector: 'app-saas-businesses-list',
  imports: [SkeletonRowsComponent, DatePipe],
  templateUrl: './list.html',
  styleUrl: './list.css',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class BusinessesListComponent {
  readonly businesses = input.required<Business[]>();
  readonly loading = input<boolean>(false);
  readonly edit = output<Business>();
  readonly remove = output<Business>();
  readonly view = output<Business>();

  readonly search = signal('');
  readonly sort = signal<BusinessSort>('created');
  readonly sortMenuOpen = signal(false);

  initials(name: string): string {
    const parts = name.trim().split(/\s+/).filter(Boolean);
    if (parts.length === 0) return '··';
    if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
    return (parts[0][0] + parts[1][0]).toUpperCase();
  }

  primaryColor(business: Business): string {
    return getPreset(business.theme).light.primary;
  }

  avatarTextColor(business: Business): string {
    return contrastColor(this.primaryColor(business));
  }

  presetLabel(business: Business): string {
    return getPreset(business.theme).label;
  }

  readonly filteredSorted = computed<Business[]>(() => {
    const q = this.search().toLowerCase().trim();
    const s = this.sort();
    let list = this.businesses().slice();

    if (q) list = list.filter((b) => b.name.toLowerCase().includes(q));

    if (s === 'name') list.sort((a, b) => a.name.localeCompare(b.name));
    else if (s === 'preset') list.sort((a, b) => this.presetLabel(a).localeCompare(this.presetLabel(b)));
    else list.sort((a, b) => b.created_at.localeCompare(a.created_at));

    return list;
  });

  readonly sortLabel = computed(() => {
    switch (this.sort()) {
      case 'name': return 'Nombre A→Z';
      case 'preset': return 'Paleta A→Z';
      default: return 'Recientes primero';
    }
  });

  setSearch(v: string): void { this.search.set(v); }
  setSort(s: BusinessSort): void {
    this.sort.set(s);
    this.sortMenuOpen.set(false);
  }
  toggleSortMenu(): void { this.sortMenuOpen.update((v) => !v); }
}
