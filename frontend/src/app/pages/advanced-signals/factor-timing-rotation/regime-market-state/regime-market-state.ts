import { ChangeDetectionStrategy, Component, computed, inject } from '@angular/core';

import {
  MARKET_REGIMES_ROUTE,
  MOMENTUM_LOOKBACK_LABEL,
  MOMENTUM_MARKET_STATE_ICON,
  REGIME_EMPTY_NOTE,
  REGIME_ERROR_DETAIL,
  REGIME_ERROR_MESSAGE,
  REGIME_SHARED_NOTE,
  REGIME_UNCERTAIN_DETAIL,
  REGIME_UNCERTAIN_LABEL,
  VALUE_REGIME_SOURCE_NOTE,
} from '../../../../models/factor-timing.model';
import {
  CRASH_RISK_ARMED_ICON,
  CRASH_RISK_NOT_ARMED_ICON,
  MARKET_REGIME_MODEL_LABEL,
} from '../../../../models/market-regimes.model';
import { FactorTimingService } from '../../../../services/factor-timing.service';
import { CrossPageLink } from '../../../../shared/cross-page-link/cross-page-link';
import { ErrorState } from '../../../../shared/error-state/error-state';
import { CardTitle, InfoCard } from '../../../../shared/info-card/info-card';
import { StatusBadge, type StatusTone } from '../../../../shared/status-badge/status-badge';
import { percent0, percent1 } from '../factor-timing-format';

/**
 * Region 2 — the regime and market state.
 *
 * **Every number in this card belongs to `MarketRegimesService`.** The market
 * trend state, the multi-asset regime probabilities and the mass on the value
 * chain's two volatility states are all that one estimate, read three ways;
 * this component computes nothing about the market and the service it injects
 * declares no regime of its own. That is the doc's own requirement — the state
 * shown here is "lo stesso motore condiviso richiamato anche da Macro & Regimes
 * Agent" — and it is why the toolbar's lookback writes the shared signal rather
 * than a local one.
 *
 * The value chain's two states are a **grouping** of the shared filter's mass
 * by volatility, not a second Markov fit, and the card says so in the line
 * beneath them. The premium beside each state is the shared service's
 * `valuePremium()`.
 *
 * Three states this card has to survive on its own:
 *
 * - the shared filter has no sample for its current settings, so there are no
 *   probabilities to show — a textual placeholder, never a row of zeros;
 * - the shared filter failed to converge, which is a *local* failure: this card
 *   shows an ErrorState with a retry and the rest of the page keeps its last
 *   valid signals, marked stale;
 * - the highest probability sits under the threshold, in which case the reading
 *   carries an uncertainty badge with the reason in words.
 */
@Component({
  selector: 'app-factor-timing-regime-state',
  // `CardTitle` is not decoration: `app-info-card` finds its projected heading
  // with `contentChild(CardTitle)`, so a template that projects `<h3
  // appCardTitle>` without importing the directive gets no header block at all
  // and the heading is dropped on the floor. Measured before this line existed:
  // the card rendered with no title.
  imports: [CardTitle, CrossPageLink, ErrorState, InfoCard, StatusBadge],
  templateUrl: './regime-market-state.html',
  host: { class: 'block' },
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class RegimeMarketState {
  private readonly service = inject(FactorTimingService);

  protected readonly sharedNote = REGIME_SHARED_NOTE;
  protected readonly sourceNote = VALUE_REGIME_SOURCE_NOTE;
  protected readonly uncertainLabel = REGIME_UNCERTAIN_LABEL;
  protected readonly uncertainDetail = REGIME_UNCERTAIN_DETAIL;
  protected readonly emptyNote = REGIME_EMPTY_NOTE;
  protected readonly errorMessage = REGIME_ERROR_MESSAGE;
  protected readonly errorDetail = REGIME_ERROR_DETAIL;
  protected readonly marketRegimesRoute = MARKET_REGIMES_ROUTE;

  protected readonly failed = this.service.regimeFailed;
  protected readonly unavailable = this.service.regimeUnavailable;
  protected readonly uncertain = this.service.regimeUncertain;
  protected readonly valueRegime = this.service.valueRegime;

  protected readonly percent = percent0;

  /** `UP` / `DOWN`, with the window it is defined over. */
  protected readonly trend = computed(() => {
    const momentum = this.service.marketState();
    return {
      state: momentum.state,
      icon: MOMENTUM_MARKET_STATE_ICON[momentum.state],
      tone: (momentum.state === 'UP' ? 'ok' : 'alert') satisfies StatusTone as StatusTone,
      window: MOMENTUM_LOOKBACK_LABEL[momentum.lookbackMonths],
      cumulative: momentum.cumulativeMarketReturn,
    };
  });

  /**
   * The bear and high-volatility flags, spelled out either way round.
   *
   * The crash indicator is armed only when both hold. Saying which half is
   * missing is the difference between "nothing to see" and "one of the two is
   * already in force" — and the wireframe's line is the negative case.
   */
  protected readonly flags = computed(() => {
    const risk = this.service.marketState().crashRisk;
    return {
      armed: risk.armed,
      icon: risk.armed ? CRASH_RISK_ARMED_ICON : CRASH_RISK_NOT_ARMED_ICON,
      bear: risk.bearState ? 'bearish' : 'not bearish',
      volatility: risk.highVolatility ? 'high-volatility flag set' : 'no high-volatility flag',
      reason: risk.reason,
      realised: percent1(risk.realisedVolatility),
      threshold: percent1(risk.volatilityThreshold),
    };
  });

  protected readonly modelLabel = computed(
    () => MARKET_REGIME_MODEL_LABEL[this.service.regimeModel()],
  );

  protected readonly regimeStates = computed(() =>
    this.service.regimeProbabilities().map((entry) => ({
      state: entry.state,
      probability: percent0(entry.probability),
      raw: entry.probability,
    })),
  );

  protected readonly topProbability = computed(() => {
    const top = this.service.topRegimeProbability();
    return top === null ? null : percent0(top);
  });

  protected readonly valueRegimeRows = computed(() =>
    this.valueRegime().map((reading) => ({
      state: reading.state,
      label: reading.label,
      probability: percent0(reading.probability),
      premium: percent1(reading.premiumPercent),
    })),
  );

  protected retry(): Promise<void> {
    return this.service.retryRegime();
  }
}
