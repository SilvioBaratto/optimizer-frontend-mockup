import { ChangeDetectionStrategy, Component, input } from '@angular/core';

import { PARTIAL_COVERAGE_ICON, type PanelCoverage } from '../../../../models/turbulence.model';

/**
 * "Partial coverage — 21/24 assets", beside the value it qualifies.
 *
 * The spec's edge case is explicit that a panel measured on part of the
 * universe keeps its figure and says so, rather than hiding the reading: an
 * absorption ratio computed on 21 of 24 series is still an absorption ratio,
 * and blanking the panel would lose it. So this sits *next to* the number, never
 * in place of it.
 *
 * Glyph and words together — the badge is legible in greyscale, and the count
 * is the whole message.
 *
 * `display: contents` because complete cover renders nothing at all: a `block`
 * host would leave an empty box in its parent's gap row.
 */
@Component({
  selector: 'app-turbulence-coverage-note',
  templateUrl: './coverage-note.html',
  host: { class: 'contents' },
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class CoverageNote {
  readonly coverage = input.required<PanelCoverage>();

  protected readonly icon = PARTIAL_COVERAGE_ICON;
}
