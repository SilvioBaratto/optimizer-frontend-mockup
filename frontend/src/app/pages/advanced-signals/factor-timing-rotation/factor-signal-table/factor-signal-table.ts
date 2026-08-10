import { ChangeDetectionStrategy, Component, computed, inject, signal } from '@angular/core';

import {
  CONFLICT_ICON,
  CONFLICT_LABEL,
  INSUFFICIENT_HISTORY_DETAIL,
  INSUFFICIENT_HISTORY_LABEL,
  PREDICTOR_CATEGORY_EXAMPLES,
  PREDICTOR_CATEGORY_LABEL,
  PREDICTOR_CATEGORY_SHORT,
  SIGNAL_DIRECTION_ICON,
  SIGNAL_DIRECTION_LABEL,
  SIGNAL_SORT_LABEL,
  TILT_DIRECTION_ICON,
  TILT_DIRECTION_LABEL,
  UNSCORED_SORT_NOTE,
  type FactorId,
  type FactorSignalRow,
  type SignalSortKey,
} from '../../../../models/factor-timing.model';
import { FactorTimingService } from '../../../../services/factor-timing.service';
import { NOT_APPLICABLE, percent0, score2, signedPoints } from '../factor-timing-format';

/** Numeric rank of a direction, so the arrow columns sort like the arrows read. */
const DIRECTION_RANK = { up: 1, flat: 0, down: -1 } as const;

/**
 * Region 5 — the factor signal table.
 *
 * One row per factor in view, with the two signals the parsimonious model
 * weights in their own columns and the other three inside the expanded detail.
 * Three things it has to get right.
 *
 * **A row with no score is not a row of zeros.** A factor whose history is
 * shorter than the lookback needs prints `insufficient history` in place of a
 * score and `—` everywhere a number would go, and it is excluded from the
 * composite. It also sinks to the bottom of every sort: ranking "no score"
 * among the numbers would make it one.
 *
 * **The conflicted row is marked.** Trend and valuation opposed with a
 * composite that cancels — neither wins — is the case the doc's whole
 * anti-extrapolation thread is about. The marker is a glyph *and* a word, and
 * it is the same row the Value Spread card's callout is generated from.
 *
 * **Expanding is a button, not the row.** The doc's own accessibility section
 * requires `aria-expanded` on a keyboard-reachable control rather than the row
 * as a click target, and its Interactions section was corrected to match: the
 * trigger is the chevron button inside the row.
 */
@Component({
  selector: 'app-factor-timing-signal-table',
  templateUrl: './factor-signal-table.html',
  host: { class: 'block' },
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class FactorSignalTable {
  private readonly service = inject(FactorTimingService);

  protected readonly sortLabel = SIGNAL_SORT_LABEL;
  protected readonly unscoredNote = UNSCORED_SORT_NOTE;
  protected readonly conflictIcon = CONFLICT_ICON;
  protected readonly conflictLabel = CONFLICT_LABEL;
  protected readonly insufficientLabel = INSUFFICIENT_HISTORY_LABEL;
  protected readonly insufficientDetail = INSUFFICIENT_HISTORY_DETAIL;
  protected readonly directionIcon = SIGNAL_DIRECTION_ICON;
  protected readonly directionLabel = SIGNAL_DIRECTION_LABEL;
  protected readonly categoryLabel = PREDICTOR_CATEGORY_LABEL;
  protected readonly categoryShort = PREDICTOR_CATEGORY_SHORT;
  protected readonly categoryExamples = PREDICTOR_CATEGORY_EXAMPLES;
  protected readonly notApplicable = NOT_APPLICABLE;

  protected readonly percent = percent0;
  protected readonly points = signedPoints;
  protected readonly score = score2;

  private readonly sortKey = signal<SignalSortKey>('factor');
  private readonly ascending = signal(true);

  private readonly expanded = signal<readonly FactorId[]>([]);

  protected readonly conflicted = this.service.conflictedRows;

  /**
   * The rows, ordered.
   *
   * Unscored rows are pinned to the bottom whichever column is active and
   * whichever way it points: `insufficient history` has no place in a ranking
   * of numbers, and sorting it to the top of an ascending Delta column would
   * put it exactly where the largest cut belongs.
   */
  protected readonly rows = computed(() => {
    const key = this.sortKey();
    const direction = this.ascending() ? 1 : -1;
    const rows = [...this.service.signalRows()];

    rows.sort((a, b) => {
      if (a.excluded !== b.excluded) return a.excluded ? 1 : -1;
      const compared = compare(a, b, key);
      return compared === 0 ? a.label.localeCompare(b.label) : compared * direction;
    });

    return rows.map((row) => ({
      row,
      expanded: this.expanded().includes(row.factor),
      tiltLabel: row.tilt === null ? null : TILT_DIRECTION_LABEL[row.tilt],
      tiltIcon: row.tilt === null ? null : TILT_DIRECTION_ICON[row.tilt],
      drivers: row.drivers.map((driver) => ({
        ...driver,
        // Zero-weight categories are shown, greyed and labelled: a reader
        // switching the timing model has to be able to see what it stopped
        // using, not watch three lines vanish.
        scoreLabel: row.insufficientHistory ? NOT_APPLICABLE : score2(driver.score),
      })),
    }));
  });

  protected readonly totals = computed(() => {
    const scored = this.service.scoredRows();
    return {
      current: scored.reduce((sum, row) => sum + row.currentWeightPct, 0),
      timing: scored.reduce((sum, row) => sum + (row.timingWeightPct ?? 0), 0),
      delta: this.service.tiltSumPp(),
    };
  });

  protected ariaSort(key: SignalSortKey): 'ascending' | 'descending' | 'none' {
    if (this.sortKey() !== key) return 'none';
    return this.ascending() ? 'ascending' : 'descending';
  }

  /** Decorative — `aria-sort` on the header already carries the state. */
  protected sortGlyph(key: SignalSortKey): string {
    if (this.sortKey() !== key) return '↕';
    return this.ascending() ? '▲' : '▼';
  }

  protected toggleSort(key: SignalSortKey): void {
    if (this.sortKey() === key) {
      this.ascending.update((value) => !value);
      return;
    }
    this.sortKey.set(key);
    // Names read A→Z; every numeric column opens on its largest value, which is
    // the row a reader of a tilt table is looking for.
    this.ascending.set(key === 'factor');
  }

  protected toggleRow(factor: FactorId): void {
    this.expanded.update((expanded) =>
      expanded.includes(factor)
        ? expanded.filter((entry) => entry !== factor)
        : [...expanded, factor],
    );
  }
}

function compare(a: FactorSignalRow, b: FactorSignalRow, key: SignalSortKey): number {
  switch (key) {
    case 'factor':
      return a.label.localeCompare(b.label);
    case 'valuation':
      return DIRECTION_RANK[a.valuation] - DIRECTION_RANK[b.valuation];
    case 'trend':
      return DIRECTION_RANK[a.trend] - DIRECTION_RANK[b.trend];
    case 'composite':
      return (a.composite ?? 0) - (b.composite ?? 0);
    case 'current':
      return a.currentWeightPct - b.currentWeightPct;
    case 'timing':
      return (a.timingWeightPct ?? 0) - (b.timingWeightPct ?? 0);
    case 'delta':
      return (a.deltaPp ?? 0) - (b.deltaPp ?? 0);
  }
}
