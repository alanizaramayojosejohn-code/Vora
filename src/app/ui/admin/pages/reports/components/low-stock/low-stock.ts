import { ChangeDetectionStrategy, Component, input } from '@angular/core';
import { LowStockProduct } from '../../../../../../models/low-stock-product.model';
import { SkeletonRowsComponent } from '../../../../../shared/skeleton-rows.component';

@Component({
  selector: 'app-admin-reports-low-stock',
  imports: [SkeletonRowsComponent],
  templateUrl: './low-stock.html',
  styleUrl: './low-stock.css',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class LowStockCardComponent {
  readonly rows = input.required<LowStockProduct[]>();
  readonly loading = input<boolean>(false);
}
