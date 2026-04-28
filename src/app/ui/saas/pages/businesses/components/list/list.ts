import { ChangeDetectionStrategy, Component, input } from '@angular/core';
import { DatePipe } from '@angular/common';
import { Business } from '../../../../../../models/business.model';

@Component({
  selector: 'app-saas-businesses-list',
  imports: [DatePipe],
  templateUrl: './list.html',
  styleUrl: './list.css',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class BusinessesListComponent {
  readonly businesses = input.required<Business[]>();
  readonly loading = input<boolean>(false);
}
