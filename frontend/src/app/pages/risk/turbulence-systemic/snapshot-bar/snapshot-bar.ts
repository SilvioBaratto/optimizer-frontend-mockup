import { ChangeDetectionStrategy, Component, computed, inject } from '@angular/core';

import { TurbulenceService } from '../../../../services/turbulence.service';
import { KeyMetricsRow, type KeyMetric } from '../../../../shared/key-metrics-row/key-metrics-row';
import { RefreshControl } from '../../../../shared/refresh-control/refresh-control';

/**
 * Region 1 — what the readings below were computed on, and when.
 *
 * Four figures, and the distinction between two of them is the reason the
 * region exists: the asset count is what moves the χ² threshold, and the two
 * windows are *estimation* windows. Neither is touched by the toolbar's range
 * control, which only decides how much of an already computed series a chart
 * draws. Printing the windows here, beside the stamp, is what makes that
 * separation visible instead of asserted.
 *
 * The age of the snapshot is always beside the stamp — "Snapshot age 18h,
 * within the expected cadence" — and when it is past the cadence the figure
 * takes a badge as well, so a dated reading is a word and a glyph rather than a
 * shade of the same sentence.
 *
 * Sticky at the top of the content area, per the region note — but only from
 * `md` up, which is the same call `pages/results/backtest-validation` makes for
 * the same reason. Four metrics collapse to one column below `sm`, and measured
 * at 320px the bar is 410px tall: pinned, it would hold 51% of an 800px viewport
 * and 72% of a 320x568 phone, leaving a third of a screen for the panels the
 * bar exists to describe. A bar that eats the content is not context. From `md`
 * the row is two or four columns and 112-242px, which is what "sticky in cima
 * all'area contenuto" was drawn as.
 *
 * The host carries the `sticky` utility rather than a wrapper:
 * `app-key-metrics-row` is already a block for exactly this reason, and a
 * wrapper would put the card's mobile bleed inside a second box.
 */
@Component({
  selector: 'app-turbulence-snapshot-bar',
  imports: [KeyMetricsRow, RefreshControl],
  templateUrl: './snapshot-bar.html',
  host: { class: 'block md:sticky md:top-0 md:z-20' },
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class SnapshotBar {
  private readonly service = inject(TurbulenceService);

  /** Every control on the page is inert while all nine panels recompute. */
  protected readonly busy = computed(() => this.service.state() === 'loading');

  private readonly universeName = computed(() => {
    const id = this.service.universeId();
    return this.service.universes.find((universe) => universe.id === id)?.name ?? 'No universe';
  });

  protected readonly metrics = computed<readonly KeyMetric[]>(() => {
    const snapshot = this.service.snapshot();
    const windows = snapshot.windows;

    return [
      {
        label: 'As of',
        value: snapshot.asOf,
        // The age is on the stamp whether or not it is late; the badge only
        // says which side of the cadence it fell on.
        note: snapshot.ageNote,
        badge: snapshot.stale
          ? { label: `Dated snapshot — ${snapshot.ageHours}h old`, tone: 'warn' as const }
          : undefined,
      },
      {
        label: 'Universe',
        value: `${snapshot.assetCount} assets`,
        note: this.universeName(),
      },
      {
        label: 'AR window',
        value: `${windows.absorptionDays}d`,
        note: `half-life ${windows.absorptionHalfLifeDays}d · ${windows.absorptionEigenvectors} eigenvectors`,
      },
      {
        label: 'Corr. window',
        value: `${windows.correlationObservations} obs`,
        note: `${windows.correlationDays} days of history per asset`,
      },
    ];
  });

  protected onRefresh(): void {
    void this.service.refresh();
  }
}
