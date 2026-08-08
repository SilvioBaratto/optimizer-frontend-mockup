import { ChangeDetectionStrategy, Component, input, output } from '@angular/core';

import { RetryButton } from '../retry-button/retry-button';

/**
 * Failure state with a way to recover.
 *
 * `role` is a real distinction the template draws: an error raised by something
 * the user just did is announced assertively (`alert`); one from a background
 * load is announced politely (`status`) so it does not interrupt.
 */
@Component({
  selector: 'app-error-state',
  imports: [RetryButton],
  templateUrl: './error-state.html',
  styleUrl: './error-state.css',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class ErrorState {
  readonly message = input.required<string>();
  readonly detail = input('');
  /** `action` for something the user triggered, `load` for a background read. */
  readonly cause = input<'action' | 'load'>('load');
  readonly retry = output<void>();
}
