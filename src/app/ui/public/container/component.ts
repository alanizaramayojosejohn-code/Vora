import { ChangeDetectionStrategy, Component } from '@angular/core';
import { RouteViewComponent } from '../../shared/route-view.component';

@Component({
  selector: 'app-public-container',
  imports: [RouteViewComponent],
  templateUrl: './component.html',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class PublicContainerComponent {}
