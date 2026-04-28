import { ChangeDetectionStrategy, Component, input } from '@angular/core';
import { DatePipe } from '@angular/common';
import { ActiveMembership } from '../../../../../../models/active-membership.model';

@Component({
  selector: 'app-admin-reports-active-memberships',
  imports: [DatePipe],
  templateUrl: './active-memberships.html',
  styleUrl: './active-memberships.css',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class ActiveMembershipsCardComponent {
  readonly rows = input.required<ActiveMembership[]>();
  readonly loading = input<boolean>(false);
}
