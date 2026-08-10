import { ChangeDetectionStrategy, Component, computed, inject } from '@angular/core';

import {
  DISPLAY_RANGES,
  DISPLAY_RANGE_LABEL,
  DISPLAY_RANGE_NOTE,
  type DisplayRange,
} from '../../../../models/turbulence.model';
import { TurbulenceService } from '../../../../services/turbulence.service';
import {
  SegmentedControl,
  type SegmentedOption,
} from '../../../../shared/segmented-control/segmented-control';

/**
 * Region 5 — the two display controls the historical charts share.
 *
 * Both are *display* controls and the region says so in one line under them:
 * the range slices series that have already been computed, and the toggle draws
 * or hides an overlay. Neither has a path into a recomputation — `setDisplayRange`
 * on the service is synchronous and touches no estimation window — so the
 * as-of stamp, the windows in the bar above and every current reading stay
 * exactly where they were while the reader moves between 6M and Max.
 *
 * The range is a radiogroup rather than a row of toggles, which is what the
 * shared segmented control is: one tab stop, arrows between options, and the
 * selected option announced with the group's name.
 */
@Component({
  selector: 'app-turbulence-display-toolbar',
  imports: [SegmentedControl],
  templateUrl: './display-toolbar.html',
  host: { class: 'block' },
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class DisplayToolbar {
  private readonly service = inject(TurbulenceService);

  protected readonly rangeNote = DISPLAY_RANGE_NOTE;

  protected readonly range = this.service.displayRange;
  protected readonly showThresholdAndBands = this.service.showThresholdAndBands;

  protected readonly rangeOptions = computed<readonly SegmentedOption[]>(() =>
    DISPLAY_RANGES.map((range) => ({ value: range, label: DISPLAY_RANGE_LABEL[range] })),
  );

  protected onRange(value: string): void {
    this.service.setDisplayRange(value as DisplayRange);
  }

  protected onThresholdToggle(event: Event): void {
    this.service.setShowThresholdAndBands((event.target as HTMLInputElement).checked);
  }
}
