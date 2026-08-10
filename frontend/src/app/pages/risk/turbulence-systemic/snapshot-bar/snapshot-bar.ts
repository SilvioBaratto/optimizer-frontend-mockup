import { ChangeDetectionStrategy, Component, computed, inject } from '@angular/core';

import { TurbulenceService } from '../../../../services/turbulence.service';
import { KeyMetricsRow, type KeyMetric } from '../../../../shared/key-metrics-row/key-metrics-row';
import { PageContextBar } from '../../../../shared/page-context-bar/page-context-bar';
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
 * Sticky at the top of the content area, per the region note — through
 * `app-page-context-bar`, the same region every other page's toolbar uses.
 *
 * It used to carry `md:sticky` on this host with the metrics row rendering its
 * own card. That stuck, but it was not the same object as the other pages' bars
 * and it showed: the card is sized to the content column, while a context bar
 * bleeds past the page gutter. Measured at 1440, the card sat at left 803 width
 * 1200 against the bar's 771/1264 — so the 32px gutter on each side was
 * uncovered and the panels scrolled visibly through those two strips as they
 * passed underneath. It also painted a white card surface where the rest of the
 * app paints the page surface with a bottom border.
 *
 * The `md`-only stickiness was the right call and is not lost: it moved onto
 * `PageContextBar` itself, so every page behaves this way now rather than this
 * one differing. `[flush]` drops the metrics row's card surface, since the bar
 * around it already owns one — two surfaces would also nest `.surface-card`'s
 * below-`sm` bleed inside the bar's.
 */
@Component({
  selector: 'app-turbulence-snapshot-bar',
  imports: [KeyMetricsRow, PageContextBar, RefreshControl],
  templateUrl: './snapshot-bar.html',
  host: { class: 'contents' },
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
