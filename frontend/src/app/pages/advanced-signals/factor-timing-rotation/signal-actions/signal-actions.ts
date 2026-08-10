import { ChangeDetectionStrategy, Component, computed, inject, signal } from '@angular/core';

import {
  APPLY_FAILURE_DETAIL,
  APPLY_FAILURE_MESSAGE,
  APPLY_SUCCESS_MESSAGE,
  APPLY_TILTS_LABEL,
  EXPORT_SNAPSHOT_LABEL,
  FACTOR_TIMING_RELATED_PAGES,
  MACRO_AGENT_ROUTE,
  MARKET_REGIMES_ROUTE,
  REGIME_SHARED_NOTE,
} from '../../../../models/factor-timing.model';
import { FactorTimingService } from '../../../../services/factor-timing.service';
import { ActionButtonRow } from '../../../../shared/action-button-row/action-button-row';
import { CrossPageLink } from '../../../../shared/cross-page-link/cross-page-link';
import { ButtonDirective } from '../../../../shared/ui/button/button.directive';
import { signedPoints } from '../factor-timing-format';

/**
 * Region 8 — the exits.
 *
 * The line above the buttons is the doc's explicit cross-reference: the regime
 * state on this page is the shared engine's, and both pages that own a view of
 * it are reachable from here. The primary action carries the Timing % column to
 * Views Builder as a tactical view, together with the model and the horizon
 * that produced it.
 *
 * The primary button never takes the `disabled` attribute, and that is not a
 * style choice. Setting `disabled` on the control a reader has just pressed
 * drops focus to `<body>`, so the confirmation that follows is announced into
 * nowhere and the reader's place in the page is gone. It carries `aria-disabled`
 * with `aria-describedby` naming the reason instead, and the handler refuses the
 * press — the button stays focusable and stays where it was.
 */
@Component({
  selector: 'app-factor-timing-actions',
  imports: [ActionButtonRow, ButtonDirective, CrossPageLink],
  templateUrl: './signal-actions.html',
  host: { class: 'flex flex-col gap-3' },
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class SignalActions {
  private readonly service = inject(FactorTimingService);

  protected readonly sharedNote = REGIME_SHARED_NOTE;
  protected readonly applyLabel = APPLY_TILTS_LABEL;
  protected readonly exportLabel = EXPORT_SNAPSHOT_LABEL;
  protected readonly failureMessage = APPLY_FAILURE_MESSAGE;
  protected readonly failureDetail = APPLY_FAILURE_DETAIL;
  protected readonly marketRegimesRoute = MARKET_REGIMES_ROUTE;
  protected readonly macroAgentRoute = MACRO_AGENT_ROUTE;
  protected readonly relatedPages = FACTOR_TIMING_RELATED_PAGES;

  protected readonly canApply = this.service.canApply;
  protected readonly applying = this.service.applying;
  protected readonly applied = this.service.applied;
  protected readonly blockedReason = this.service.applyBlockedReason;

  /** What left the page, announced rather than only downloaded. */
  protected readonly exportNotice = signal<string | null>(null);

  protected readonly applyFailed = computed(
    () => this.service.errorMessage() === APPLY_FAILURE_MESSAGE,
  );

  protected readonly appliedSummary = computed(() => {
    const payload = this.applied();
    if (payload === null) return null;
    const moved = payload.tilts
      .filter((tilt) => tilt.deltaPp !== 0)
      .map((tilt) => `${tilt.label} ${signedPoints(tilt.deltaPp)}`)
      .join(' · ');
    return `${APPLY_SUCCESS_MESSAGE} — ${payload.tilts.length} weights, horizon ${payload.horizon}${moved === '' ? '' : `. Moved: ${moved}`}`;
  });

  protected async apply(): Promise<void> {
    // Refused in the handler rather than by the `disabled` attribute, so the
    // button the reader just pressed keeps focus.
    if (!this.canApply()) return;
    await this.service.applyTilts();
  }

  protected exportSnapshot(): void {
    const csv = this.service.exportSnapshot();
    const filename = this.service.exportFilename;
    this.exportNotice.set(
      `Exported ${this.service.signalRows().length} factor rows to ${filename}`,
    );

    // Best-effort: object URLs do not exist in every host. The announcement
    // above is not best-effort, because it is what tells the reader what left.
    if (typeof URL.createObjectURL !== 'function') return;
    const url = URL.createObjectURL(new Blob([csv], { type: 'text/csv' }));
    const link = document.createElement('a');
    link.href = url;
    link.download = filename;
    link.click();
    URL.revokeObjectURL(url);
  }
}
