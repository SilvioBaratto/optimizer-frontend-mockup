import { ChangeDetectionStrategy, Component, input, output } from '@angular/core';

export type BannerVariant = 'success' | 'error';

/**
 * Outcome banner for a page-level action.
 *
 * The two variants behave differently on purpose, and the difference is the
 * whole point of the component: success is `role="status"`, dismissible and
 * transient, because it confirms something the user already knows they did.
 * Error is `role="alert"`, announced immediately, and stays until it is
 * retried or explicitly closed — a failure that fades out is a failure the
 * user never learns about.
 *
 * Neither variant clears the content beneath it: the user's unsaved work
 * survives a failed write.
 */
@Component({
  selector: 'app-status-banner',
  templateUrl: './status-banner.html',
  styleUrl: './status-banner.css',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class StatusBanner {
  readonly variant = input.required<BannerVariant>();
  readonly message = input.required<string>();
  /** Relative time such as "2 min ago"; success variant only. */
  readonly timestamp = input('');

  readonly dismissed = output<void>();
  readonly retried = output<void>();
}
