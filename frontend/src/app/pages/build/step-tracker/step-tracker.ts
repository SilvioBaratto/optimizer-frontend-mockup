import { ChangeDetectionStrategy, Component, inject, input } from '@angular/core';
import { RouterLink } from '@angular/router';

import { BuildStepTrackerService } from '../build-step-tracker.service';

/**
 * The Build flow's 5-step progress indicator.
 *
 * Steps ahead of the unlocked point render as plain text rather than links —
 * the spec makes reachability conditional on the earlier pages being free of
 * blocking warnings, and a link that refuses to work is worse than no link.
 */
@Component({
  selector: 'app-step-tracker',
  imports: [RouterLink],
  templateUrl: './step-tracker.html',
  styleUrl: './step-tracker.css',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class StepTracker {
  private readonly tracker = inject(BuildStepTrackerService);

  /** Index of the step this page represents. */
  readonly current = input.required<number>();

  protected readonly steps = this.tracker.steps;
  protected readonly unlockedThrough = this.tracker.unlockedThrough;
}
