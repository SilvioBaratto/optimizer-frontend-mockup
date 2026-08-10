import { ChangeDetectionStrategy, Component, computed, inject } from '@angular/core';

import {
  ATTRIBUTION_MEASURE_LABEL,
  ATTRIBUTION_MEASURE_SYMBOL,
  ATTRIBUTION_METHOD_BADGE,
  ATTRIBUTION_METHOD_ICON,
  ATTRIBUTION_METHOD_LABEL,
  ATTRIBUTION_METHOD_NOTE,
} from '../../../../models/risk-attribution.model';
import { RiskAttributionService } from '../../../../services/risk-attribution.service';
import { KeyMetricsRow, type KeyMetric } from '../../../../shared/key-metrics-row/key-metrics-row';
import { SkeletonBlock } from '../../../../shared/skeleton-block/skeleton-block';
import { StatusBadge, type StatusTone } from '../../../../shared/status-badge/status-badge';
import { ratio, riskAmount, share, signedShare } from '../attribution-format';

/** One line under the row: a glyph, a word, and the sentence behind them. */
interface SummaryNote {
  readonly id: string;
  readonly icon: string;
  readonly term: string;
  readonly text: string;
}

/**
 * How `DI_ρ(X)` reads in words.
 *
 * A value near 1 says the components are almost co-monotone — the book is
 * concentrated even if no single line looks large. The wireframe prints
 * "0.72 moderate", and the word is what a reader who cannot compare two shades
 * of the same colour is left with.
 */
function diversificationReading(index: number): string {
  if (index > 1) return 'above 1 — no diversification credit';
  if (index >= 0.85) return 'concentrated — components close to co-monotone';
  if (index >= 0.6) return 'moderate';
  return 'well diversified';
}

/**
 * Region 2 — the four headline figures, and the badges that qualify them.
 *
 * Every number here is read off `totals()`, the same object the table's TOTAL
 * row prints, so the row and this card cannot disagree: `EC` *is* the TOTAL
 * row's Euler figure and `DI` *is* that figure over the TOTAL row's stand-alone
 * figure.
 *
 * Two of the badges carry the page's sharpest claims:
 *
 * - Under Marginal the coverage figure drops below 100% and says so. The
 *   with-without contributions are shown unrescaled, because forcing them back
 *   to full allocation is exactly the operation that destroys their RORAC
 *   compatibility — the property that made attributing worth doing.
 * - `DI > 1` is only an anomaly for a sub-additive measure. VaR is homogeneous
 *   of degree one and co-monotonic additive but **not** sub-additive, so under
 *   VaR the same reading is a concentration finding and gets non-alarming copy.
 *   The badge branches on `measureIsSubadditive()` rather than assuming every
 *   measure behaves like volatility.
 */
@Component({
  selector: 'app-attribution-summary',
  imports: [KeyMetricsRow, SkeletonBlock, StatusBadge],
  templateUrl: './attribution-summary.html',
  host: { class: 'block' },
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class AttributionSummary {
  private readonly service = inject(RiskAttributionService);

  protected readonly loading = this.service.loading;
  protected readonly snapshotStale = this.service.snapshotStale;
  protected readonly estimateUncertain = this.service.estimateUncertain;

  protected readonly metrics = computed<KeyMetric[]>(() => {
    const measure = this.service.measure();
    const method = this.service.method();
    const unit = this.service.displayUnit();
    const nav = this.service.netAssetValue();
    const index = this.service.portfolioDi();

    return [
      {
        label: 'Total risk (EC)',
        value: riskAmount(this.service.economicCapital(), unit, nav),
        note: this.measureNote(),
        badge: undefined,
      },
      {
        label: 'Sum of contributions',
        // The coverage is a share of EC and stays a percentage in both units:
        // it is the sum check, not a risk figure the `$ / %` switch reformats.
        // The two amounts under it are risk figures, and do follow the switch.
        value: share(this.service.contributionCoverage()),
        note: `Σ ${ATTRIBUTION_METHOD_LABEL[method].toLowerCase()} ${riskAmount(this.service.contributionSum(), unit, nav)} of ${riskAmount(this.service.economicCapital(), unit, nav)}`,
        badge: this.service.fullAllocation()
          ? { label: 'Full allocation', tone: 'ok' as StatusTone }
          : { label: 'Below full allocation', tone: 'warn' as StatusTone },
      },
      {
        label: 'Portfolio DI',
        value: ratio(index),
        note: `${diversificationReading(index)} · benefit ${signedShare(this.service.diversificationBenefit())}`,
        badge: this.subadditivityBadge(),
      },
      {
        label: 'Allocation rule',
        value: ATTRIBUTION_METHOD_BADGE[method],
        note:
          method === 'euler'
            ? `Aumann-Shapley gradient — the unique coherent linear principle, for ${ATTRIBUTION_MEASURE_LABEL[measure]}`
            : `With-without difference ρ(X) − ρ(X − X_i) — coherent only after a rescaling that is not applied`,
      },
    ];
  });

  /**
   * `σ(X) · Volatility`, `VaR_α(X) · VaR at 99%`.
   *
   * The confidence level is named only where one was taken: printing "95%"
   * beside a moment would name a quantile that was never computed.
   */
  private measureNote(): string {
    const measure = this.service.measure();
    const symbol = ATTRIBUTION_MEASURE_SYMBOL[measure];
    const label = ATTRIBUTION_MEASURE_LABEL[measure];
    return this.service.confidenceEnabled()
      ? `${symbol} · ${label} at ${this.service.confidence()}%`
      : `${symbol} · ${label}`;
  }

  /**
   * The badge beside `DI`.
   *
   * Nothing at or below 1, which is the whole reachable range of the shipped
   * book. Above it the copy depends on the measure, and that dependency is the
   * point: a sub-additive measure cannot produce it, so for volatility and ES
   * the only explanation left is the data; for VaR it is a real reading.
   */
  private subadditivityBadge(): { label: string; tone: StatusTone } | undefined {
    if (this.service.portfolioDi() <= 1) return undefined;
    return this.service.measureIsSubadditive()
      ? { label: 'Data anomaly', tone: 'alert' }
      : { label: 'VaR not sub-additive here', tone: 'warn' };
  }

  /** The sentences behind the figures, each with a glyph *and* a word. */
  protected readonly notes = computed<SummaryNote[]>(() => {
    const method = this.service.method();
    const out: SummaryNote[] = [
      {
        id: 'method',
        icon: ATTRIBUTION_METHOD_ICON[method],
        term: this.service.fullAllocation() ? 'Full allocation' : 'Under-coverage',
        text: ATTRIBUTION_METHOD_NOTE[method],
      },
      {
        id: 'subadditivity',
        icon: this.service.measureIsSubadditive() ? '≤' : '?',
        term: this.service.measureIsSubadditive() ? 'Sub-additive' : 'Not sub-additive',
        text: this.service.measureSubadditivityNote(),
      },
    ];

    const stale = this.service.snapshotStaleNote();
    if (stale) out.push({ id: 'stale', icon: '◐', term: 'Snapshot not current', text: stale });

    const uncertain = this.service.estimateUncertainNote();
    if (uncertain) {
      out.push({
        id: 'uncertainty',
        icon: '!',
        term: 'High estimation uncertainty',
        text: `${uncertain} This snapshot carries ${this.service.snapshot().sampleSize} observations against the ${this.service.requiredSampleSize()} this confidence level needs.`,
      });
    }

    return out;
  });
}
