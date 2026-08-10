import { ChangeDetectionStrategy, Component, inject } from '@angular/core';

import {
  CURRENT_STEP_SUFFIX,
  STEP_STATE_ICON,
  STEP_STATE_LABEL,
  type StepState,
} from '../../../../models/approval.model';
import { ApprovalGateService } from '../../../../services/approval-gate.service';
import { InfoCard } from '../../../../shared/info-card/info-card';

/**
 * Region 6 — the four mandatory steps, with this trade's position on them.
 *
 * Built here rather than reused: `pages/build/step-tracker` is bound to the
 * build wizard's own service and its five steps, and this tracker's states are
 * not that one's. In particular it has a fourth state the wizard has no need
 * for — `unreachable`, the broker adapter with no adapter registered — which is
 * not a politer spelling of "not yet reached". A step that does not run at all
 * under the current posture must not be drawn as one the trade is on its way
 * to, or the tracker promises a routing that cannot happen.
 *
 * The current step is marked three ways, none of which is colour: the word
 * "— current" beside its label, `aria-current="step"`, and a glyph. The doc
 * requires the first two by name.
 */
@Component({
  selector: 'app-approval-step-tracker',
  imports: [InfoCard],
  templateUrl: './step-tracker.html',
  host: { class: 'block' },
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class StepTracker {
  private readonly service = inject(ApprovalGateService);

  protected readonly steps = this.service.selectedSteps;

  protected readonly icon = STEP_STATE_ICON;
  protected readonly stateLabel = STEP_STATE_LABEL;
  protected readonly currentSuffix = CURRENT_STEP_SUFFIX;

  /**
   * Weight and contrast follow the state, and are never the only thing that
   * does. A greyscale reader loses nothing here: the glyph, the label and the
   * screen-reader text all still say where the trade stands.
   *
   * A step still ahead is `text-text-secondary`, not `text-text-tertiary`:
   * measured on the card's surface the tertiary token gives 3.86:1, under the
   * 4.5:1 body text needs, and the doc lists StepTracker contrast in both
   * themes among its acceptance criteria. The step's position is already
   * carried by weight, by the glyph and by the label beside it, so the recession
   * does not have to be bought with legibility.
   */
  protected labelClass(state: StepState): string {
    switch (state) {
      case 'current':
        return 'font-medium text-text';
      case 'passed':
        return 'text-text';
      default:
        return 'text-text-secondary';
    }
  }
}
