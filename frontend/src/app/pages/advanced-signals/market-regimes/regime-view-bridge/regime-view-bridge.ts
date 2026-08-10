import { ChangeDetectionStrategy, Component, computed, inject, signal } from '@angular/core';

import {
  LOW_CONFIDENCE_NOTE,
  VIEWS_BUILDER_ROUTE,
  VIEW_DIRECTION_ICON,
  VIEW_DIRECTION_LABEL,
} from '../../../../models/market-regimes.model';
import { MarketRegimesService } from '../../../../services/market-regimes.service';
import { ActionButtonRow } from '../../../../shared/action-button-row/action-button-row';
import { CrossPageLink } from '../../../../shared/cross-page-link/cross-page-link';
import { ErrorState } from '../../../../shared/error-state/error-state';
import { CardTitle, InfoCard } from '../../../../shared/info-card/info-card';
import { ButtonDirective } from '../../../../shared/ui/button/button.directive';
import { SlideOverComponent } from '../../../../shared/ui/slide-over/slide-over';
import { percent0 } from '../regimes-format';

/** Why the two actions are refusing input. */
const UNAVAILABLE_REASON =
  'There is no valid estimate to build a view from — the filter has to converge on this combination first.';

/**
 * Region 10 — the bridge to Views Builder, and the page's primary action.
 *
 * The one invariant worth more than the rest of this file: **the direction
 * shown here is computed from the dominant state and cannot be set**. There is
 * no signal here holding a direction, no input taking one and no setter for one
 * in the service — `regimeImpliedView()` is a `computed()` off
 * `dominantState()`, so the moment the hero card's reading changes this card's
 * reading changes with it. The two cards making opposite claims is not a bug
 * that is being guarded against; it is a state that does not exist.
 *
 * The economics is the reason the page ends here. A high filtered probability
 * of a bearish state is a statement about the opportunity set — lower expected
 * returns, higher correlations, a wider covariance — and that is exactly the
 * content Black-Litterman ingests as a view and combines with the market
 * equilibrium. Sending it does not apply it: Views Builder is where the user
 * refines it before it meets the equilibrium, which is why the primary action
 * leads there rather than to a result.
 *
 * `Preview view` opens a read-only slide-over rather than navigating, per the
 * spec — the reader checks the draft without leaving the estimate that produced
 * it. `app-slide-over` traps focus, closes on Escape and returns focus to the
 * button that opened it.
 */
@Component({
  selector: 'app-market-regimes-view-bridge',
  imports: [
    ActionButtonRow,
    ButtonDirective,
    CardTitle,
    CrossPageLink,
    ErrorState,
    InfoCard,
    SlideOverComponent,
  ],
  templateUrl: './regime-view-bridge.html',
  host: { class: 'block' },
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class RegimeViewBridge {
  private readonly service = inject(MarketRegimesService);

  protected readonly reasonId = 'mr-bridge-unavailable';
  protected readonly unavailableReason = UNAVAILABLE_REASON;
  protected readonly lowConfidenceNote = LOW_CONFIDENCE_NOTE;
  protected readonly viewsBuilderRoute = VIEWS_BUILDER_ROUTE;
  protected readonly directionLabel = VIEW_DIRECTION_LABEL;
  protected readonly directionIcon = VIEW_DIRECTION_ICON;

  protected readonly view = this.service.regimeImpliedView;
  protected readonly sending = this.service.sendingView;
  protected readonly sentView = this.service.sentView;

  protected readonly previewOpen = signal(false);

  /**
   * The failure of the primary action, which the service keeps apart from a
   * failure of the load.
   *
   * They are not the same event: a load failure is a background read and is
   * announced politely by the page, while this one is something the reader just
   * pressed and is announced assertively, here, beside the button that did it.
   * It also leaves the estimate alone — Preview stays live, because there is
   * nothing wrong with the view, only with the hand-over.
   */
  protected readonly sendFailure = this.service.sendErrorMessage;
  protected readonly sendFailureDetail = this.service.sendErrorDetail;

  /**
   * Whether the two actions are live.
   *
   * Off while the estimate is missing or has failed — there is no view to
   * preview and nothing to send. A low-confidence filter does **not** turn them
   * off: it is a caution about a reading that exists, and the page states it in
   * words both here and in the diagnostics footer.
   */
  protected readonly canUse = computed(
    () => this.view() !== null && this.service.state() === 'ready',
  );

  protected readonly lowConfidence = computed(
    () => this.service.diagnostics().lowFilterConfidence,
  );

  /** `Derived from Crash 58%` — the provenance, printed rather than implied. */
  protected readonly derivedFrom = computed(() => {
    const view = this.view();
    if (view === null) return null;
    return `${view.derivedFromState} ${percent0(view.derivedFromProbability)}`;
  });

  protected openPreview(): void {
    if (!this.canUse()) return;
    this.previewOpen.set(true);
  }

  protected closePreview(): void {
    this.previewOpen.set(false);
  }

  /**
   * Hands the draft to Views Builder.
   *
   * The button keeps `aria-disabled` rather than `disabled` while the hand-over
   * is in flight — it is the control the reader just pressed, and disabling it
   * would take it out of the tab order and drop focus to `<body>` until the
   * call lands. The second press is refused here instead.
   */
  protected async send(): Promise<void> {
    if (!this.canUse() || this.sending()) return;
    await this.service.sendView();
  }

  /** A retry after a failed hand-over: the alert clears, then the call re-runs. */
  protected async retrySend(): Promise<void> {
    if (this.sending()) return;
    this.service.clearError();
    await this.service.sendView();
  }
}
