import { ChangeDetectionStrategy, Component, input } from '@angular/core';

/**
 * Nothing-to-show state: title, explanation and a way forward.
 *
 * `role="status"` per the template's component inventory — an empty result is
 * information, not an error, so it is announced politely.
 */
@Component({
  selector: 'app-empty-state',
  templateUrl: './empty-state.html',
  styleUrl: './empty-state.css',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class EmptyState {
  readonly title = input.required<string>();
  readonly detail = input('');
}
