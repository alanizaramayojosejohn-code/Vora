import { ChangeDetectionStrategy, Component, input } from '@angular/core';
import { CurrencyPipe } from '@angular/common';
import { LowStockProduct } from '../../../../../../models/low-stock-product.model';

@Component({
  selector: 'app-admin-reports-low-stock',
  imports: [CurrencyPipe],
  templateUrl: './low-stock.html',
  styleUrl: './low-stock.css',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class LowStockCardComponent {
  readonly rows = input.required<LowStockProduct[]>();
  readonly loading = input<boolean>(false);
}
