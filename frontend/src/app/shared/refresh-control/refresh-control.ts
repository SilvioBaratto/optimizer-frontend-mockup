import { ChangeDetectionStrategy, Component, input, output } from '@angular/core';

import { ButtonDirective } from '../ui/button/button.directive';

/**
 * Re-reads one region's data.
 *
 * Scope matters and is the caller's business: the specs are explicit that a
 * refresh inside an InfoCard re-runs only that card's read, never the page.
 */
@Component({
  selector: 'app-refresh-control',
  imports: [ButtonDirective],
  templateUrl: './refresh-control.html',
  styleUrl: './refresh-control.css',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class RefreshControl {
  readonly label = input('Refresh');
  readonly busy = input(false);
  readonly refresh = output<void>();
}
