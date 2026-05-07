import { ChangeDetectionStrategy, Component, computed, input, output, signal } from '@angular/core';
import { Category } from '../../../../../../models/category.model';

@Component({
  selector: 'app-admin-categories-list',
  templateUrl: './list.html',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class CategoriesListComponent {
  readonly categories = input.required<Category[]>();
  readonly loading = input<boolean>(false);
  readonly edit = output<Category>();
  readonly remove = output<Category>();

  readonly search = signal('');

  initials(name: string): string {
    const parts = name.trim().split(/\s+/).filter(Boolean);
    if (parts.length === 0) return '··';
    if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
    return (parts[0][0] + parts[1][0]).toUpperCase();
  }

  readonly filtered = computed<Category[]>(() => {
    const q = this.search().toLowerCase().trim();
    if (!q) return this.categories().slice();
    return this.categories().filter((c) => c.name.toLowerCase().includes(q));
  });

  setSearch(v: string): void { this.search.set(v); }
}
