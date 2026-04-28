import { ChangeDetectionStrategy, Component, input } from '@angular/core';
import { DatePipe } from '@angular/common';
import { AttendanceWithDetails } from '../../../../../../models/attendance.model';

@Component({
  selector: 'app-caja-attendance-list',
  imports: [DatePipe],
  templateUrl: './list.html',
  styleUrl: './list.css',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class AttendanceListComponent {
  readonly attendance = input.required<AttendanceWithDetails[]>();
  readonly loading = input<boolean>(false);
}
