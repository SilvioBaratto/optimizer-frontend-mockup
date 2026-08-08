import { ChangeDetectionStrategy, Component, input } from '@angular/core';

/**
 * Row of page-level actions.
 *
 * Wraps rather than compresses below `sm`: the responsive table in the template
 * says these go to a new line instead of shrinking, so 44px targets survive.
 */
@Component({
  selector: 'app-action-button-row',
  templateUrl: './action-button-row.html',
  styleUrl: './action-button-row.css',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class ActionButtonRow {
  readonly align = input<'start' | 'end'>('end');
}
