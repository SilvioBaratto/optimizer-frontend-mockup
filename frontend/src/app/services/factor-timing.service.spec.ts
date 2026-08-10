/**
 * The factor-timing engine.
 *
 * The cases below hold the four claims the page would otherwise be free to
 * break:
 *
 * 1. it runs **no regime filter of its own** — every regime reading is the
 *    shared `MarketRegimesService` estimate, and this page's lookback control
 *    writes that service's signal;
 * 2. the valuation arrow, the value-spread marker and the extrapolation
 *    callout are **one number** rendered three ways;
 * 3. the tilts **sum to zero** and a factor without history is **excluded**
 *    rather than scored at zero;
 * 4. market timing's information ratio is **absent**, and absence is not a
 *    value.
 */

import { TestBed } from '@angular/core/testing';

import {
  APPLY_FAILURE_MESSAGE,
  FACTOR_IDS,
  LOAD_FAILURE_MESSAGE,
  NO_CONFLICT_KEY,
  NO_FACTOR_SELECTED_ERROR,
  REGIME_UNCERTAIN_THRESHOLD_PCT,
  VALUE_VOLATILITY_STATE_OF_REGIME,
  VIEWS_BUILDER_ROUTE,
  type FactorId,
} from '../models/factor-timing.model';
import { REGIME_MODELS } from '../models/market-regimes.model';
import { FactorTimingService } from './factor-timing.service';
import { MarketRegimesService } from './market-regimes.service';

describe('FactorTimingService', () => {
  let service: FactorTimingService;
  let regimes: MarketRegimesService;

  beforeEach(() => {
    TestBed.configureTestingModule({});
    service = TestBed.inject(FactorTimingService);
    regimes = TestBed.inject(MarketRegimesService);
  });

  function row(factor: FactorId) {
    const found = service.signalRows().find((entry) => entry.factor === factor);
    expect(found).toBeTruthy();
    return found!;
  }

  // --- defaults reproduce the wireframe ------------------------------------

  it('when the service starts, the toolbar sits on the defaults the spec names', () => {
    expect(service.lookback()).toBe(36);
    expect(service.rebalancing()).toBe('quarterly');
    expect(service.weighting()).toBe('dynamic');
    expect(service.timingModel()).toBe('parsimonious');
    expect(service.valueSpreadMetric()).toBe('z-score');
    expect(service.factorsInView()).toEqual(FACTOR_IDS);
    expect(service.lastComputed()).toBe('2026-07-31 06:00 UTC');
    expect(service.state()).toBe('ready');
  });

  it('when the defaults hold, every row carries the weight the wireframe prints', () => {
    expect(row('value').currentWeightPct).toBe(12);
    expect(row('value').timingWeightPct).toBe(16);
    expect(row('value').deltaPp).toBe(4);

    expect(row('momentum').timingWeightPct).toBe(10);
    expect(row('momentum').deltaPp).toBe(0);

    expect(row('size').timingWeightPct).toBe(9);
    expect(row('low-vol').timingWeightPct).toBe(12);
    expect(row('quality').timingWeightPct).toBe(13);
  });

  it('when the defaults hold, the signal directions match the wireframe row by row', () => {
    expect(row('value').valuation).toBe('up');
    expect(row('value').trend).toBe('down');
    expect(row('value').tilt).toBe('overweight');

    expect(row('momentum').valuation).toBe('down');
    expect(row('momentum').trend).toBe('up');
    expect(row('momentum').tilt).toBe('neutral');

    expect(row('size').tilt).toBe('overweight');
    expect(row('low-vol').tilt).toBe('underweight');
    expect(row('quality').tilt).toBe('underweight');
  });

  // --- 1. one regime engine -------------------------------------------------

  it('when the lookback changes, it is the shared regime service that moves', async () => {
    service.setLookback(12);
    await service.settled();

    expect(regimes.momentumLookback()).toBe(12);
    expect(service.lookback()).toBe(12);
    expect(service.marketState()).toBe(regimes.momentum());
  });

  it('when the shared filter reports a state, this page reports the same one', () => {
    expect(service.marketState().state).toBe(regimes.momentum().state);
    expect(service.regimeProbabilities()).toBe(regimes.stateProbabilities());
    expect(service.dominantState()).toBe(regimes.dominantState());
  });

  it('when the shared regime model switches, the states here switch with it', async () => {
    regimes.setModel('hamilton');
    await regimes.settled();

    expect(service.regimeProbabilities().map((entry) => entry.state)).toEqual([
      'Recession',
      'Expansion',
    ]);
    expect(service.regimeModel()).toBe('hamilton');
  });

  it('when the shared filter has no sample, this page reports no regime rather than inventing one', async () => {
    regimes.setUniverse('em-equities');
    await regimes.settled();

    expect(service.regimeUnavailable()).toBe(true);
    expect(service.regimeProbabilities()).toEqual([]);
    expect(service.valueRegime()).toEqual([]);
    expect(service.topRegimeProbability()).toBeNull();
  });

  it('when the value chain is read, its two states carry the shared filter’s own mass', () => {
    const readings = service.valueRegime();
    const shared = regimes.stateProbabilities();

    const high = shared
      .filter((entry) => entry.state === 'Crash' || entry.state === 'Recovery')
      .reduce((sum, entry) => sum + entry.probability, 0);

    expect(readings.map((reading) => reading.state)).toEqual([
      'high-volatility',
      'low-volatility',
    ]);
    expect(readings[0].probability).toBeCloseTo(high, 1);
    expect(readings[0].probability + readings[1].probability).toBeCloseTo(100, 1);
  });

  it('when the shared vocabulary changes, the volatility mapping is forced to change with it', () => {
    // The grouping is keyed by the shared state names. If one is renamed
    // upstream and this map is not, the mass silently stops adding up — so the
    // coverage is asserted rather than assumed.
    const shared = REGIME_MODELS.filter(
      (model) => model.id === 'four-state' || model.id === 'hamilton',
    ).flatMap((model) => model.states);

    for (const state of shared) {
      expect(VALUE_VOLATILITY_STATE_OF_REGIME[state]).toBeDefined();
    }
  });

  it('when the shared model is Hamilton, the value chain still carries all the mass', async () => {
    regimes.setModel('hamilton');
    await regimes.settled();

    const readings = service.valueRegime();
    expect(readings[0].probability + readings[1].probability).toBeCloseTo(100, 1);
    expect(readings[0].probability).toBeGreaterThan(0);
  });

  it('when the value chain is read, the premium beside it is the shared service’s', () => {
    const readings = service.valueRegime();
    expect(readings[0].premiumPercent).toBe(12.4);
    expect(readings[1].premiumPercent).toBe(0.6);
  });

  it('when the top state probability sits below the threshold, the regime reads uncertain', () => {
    // The default reading is Crash at 58%, which is under the threshold — the
    // wireframe's own "[!] Regime uncertain" line.
    const top = service.topRegimeProbability() as number;
    expect(top).toBeLessThan(REGIME_UNCERTAIN_THRESHOLD_PCT);
    expect(service.regimeUncertain()).toBe(true);
  });

  it('when the top state probability clears the threshold, the badge goes away', async () => {
    regimes.setModel('hamilton');
    await regimes.settled();

    expect(service.topRegimeProbability()).toBeGreaterThanOrEqual(
      REGIME_UNCERTAIN_THRESHOLD_PCT,
    );
    expect(service.regimeUncertain()).toBe(false);
  });

  it('when the shared filter fails, this page marks itself stale without blanking', async () => {
    await regimes.refresh(true);

    expect(service.regimeFailed()).toBe(true);
    expect(service.stale()).toBe(true);
    expect(service.state()).toBe('ready');
    expect(service.signalRows().length).toBe(FACTOR_IDS.length);
  });

  // --- 2. one number, three renderings -------------------------------------

  it('when a factor is positioned on its band, the valuation arrow is that same reading', () => {
    const reading = service.valueSpread().find((entry) => entry.factor === 'momentum');
    expect(reading?.zScore).toBeGreaterThan(0);
    // Rich on the band, unfavourable in the table — one number, two renderings.
    expect(row('momentum').valuation).toBe('down');

    const value = service.valueSpread().find((entry) => entry.factor === 'value');
    expect(value?.zScore).toBeLessThan(0);
    expect(row('value').valuation).toBe('up');
  });

  it('when the callout is generated, it repeats the conflicted row’s own two fields', () => {
    const check = service.extrapolationCheck();
    const conflicted = row('momentum');

    expect(check?.factor).toBe('momentum');
    expect(conflicted.trend).toBe('up');
    expect(check?.trendClause).toBe('trailing return is strong');
    expect(conflicted.valuation).toBe('down');
    expect(check?.valuationClause).toBe('valuation reads rich');
    expect(check?.summary).toBe('Momentum — trailing return is strong, valuation reads rich.');
  });

  it('when the value-spread metric changes, the reading is restated and can cross a band', async () => {
    const before = service.valueSpread().find((entry) => entry.factor === 'quality');
    expect(before?.band).toBe('ordinary');

    service.setValueSpreadMetric('price-book');
    await service.settled();

    const after = service.valueSpread().find((entry) => entry.factor === 'quality');
    expect(after?.band).toBe('elevated');
    expect(service.valueSpreadMetric()).toBe('price-book');
  });

  it('when the metric is a percentile, the printed number is a percentile and not a z', async () => {
    service.setValueSpreadMetric('percentile');
    await service.settled();

    const reading = service.valueSpread().find((entry) => entry.factor === 'low-vol');
    expect(reading?.display).toBeGreaterThan(50);
    expect(reading?.display).toBeLessThan(100);
  });

  it('when the sample is read, no factor sits at a historical extreme', () => {
    expect(service.anyExtreme()).toBe(false);
    for (const reading of service.valueSpread()) {
      expect(Math.abs(reading.zScore)).toBeLessThan(2);
    }
  });

  // --- 3. tilts sum to zero, and absence is excluded -----------------------

  it('when the tilts are computed, they reallocate weight and never add any', () => {
    expect(service.tiltSumPp()).toBe(0);

    const current = service.scoredRows().reduce((sum, entry) => sum + entry.currentWeightPct, 0);
    const timing = service
      .scoredRows()
      .reduce((sum, entry) => sum + (entry.timingWeightPct as number), 0);
    expect(timing).toBe(current);
  });

  it('when the weighting mode changes, the tilts still sum to zero', async () => {
    for (const mode of ['static', 'vol-scaled', 'dynamic'] as const) {
      service.setWeighting(mode);
      await service.settled();
      expect(service.tiltSumPp()).toBe(0);
    }
  });

  it('when the timing model changes, the tilts change and still sum to zero', async () => {
    const before = service.scoredRows().map((entry) => entry.deltaPp);

    service.setTimingModel('multi-signal');
    await service.settled();

    expect(service.scoredRows().map((entry) => entry.deltaPp)).not.toEqual(before);
    expect(service.tiltSumPp()).toBe(0);
  });

  it('when a factor has too little history, it carries no score and is excluded', () => {
    const profitability = row('profitability');

    expect(profitability.insufficientHistory).toBe(true);
    expect(profitability.excluded).toBe(true);
    expect(profitability.valuationScore).toBeNull();
    expect(profitability.trendScore).toBeNull();
    expect(profitability.composite).toBeNull();
    expect(profitability.tilt).toBeNull();
    expect(profitability.deltaPp).toBeNull();
    expect(profitability.timingWeightPct).toBeNull();
    expect(service.scoredRows().some((entry) => entry.factor === 'profitability')).toBe(false);
  });

  it('when a factor is excluded, it is absent from the value-spread band too', () => {
    expect(service.valueSpread().some((entry) => entry.factor === 'profitability')).toBe(false);
    expect(service.valueSpreadOmissions().map((entry) => entry.factor)).toContain('profitability');
  });

  it('when only the row with no history is in view, the page is empty rather than zeroed', async () => {
    service.setFactorsInView(['profitability']);
    await service.settled();

    expect(service.emptyReason()).toBe('no-history');
    expect(service.state()).toBe('empty');
    expect(service.appliedTiltSet()).toBeNull();
    expect(service.canApply()).toBe(false);
  });

  it('when the last factor would be removed, the removal is refused and said so', () => {
    service.setFactorsInView(['value']);

    service.toggleFactor('value');

    expect(service.factorsInView()).toEqual(['value']);
    expect(service.selectionError()).toBe(NO_FACTOR_SELECTED_ERROR);
  });

  it('when a factor is toggled back in, the view keeps the panel’s own order', async () => {
    service.toggleFactor('value');
    await service.settled();
    expect(service.factorsInView()).not.toContain('value');

    service.toggleFactor('value');
    await service.settled();
    expect(service.factorsInView()).toEqual(FACTOR_IDS);
    expect(service.selectionError()).toBeNull();
  });

  // --- 4. absence is not a value -------------------------------------------

  it('when the variants are compared, market timing carries no information ratio at all', () => {
    const market = service.timingVariants().find((entry) => entry.variant === 'market-timing');

    expect(market?.informationRatio).toBeNull();
    expect(market?.missingReason).toBe('not-reported');
  });

  it('when the variants are compared, the baseline’s absence is a different claim', () => {
    const baseline = service
      .timingVariants()
      .find((entry) => entry.variant === 'factor-investing');

    expect(baseline?.informationRatio).toBeNull();
    expect(baseline?.missingReason).toBe('baseline');
  });

  it('when the variants are compared, only the three defined ratios carry numbers', () => {
    const measured = service
      .timingVariants()
      .filter((entry) => entry.informationRatio !== null)
      .map((entry) => [entry.variant, entry.informationRatio]);

    expect(measured).toEqual([
      ['factor-timing', 0.42],
      ['anomaly-timing', 0.6],
      ['pure-anomaly-timing', 0.59],
    ]);
  });

  it('when the utility gain is read, it is a separate measure with its own range', () => {
    expect(service.utilityGains()).toEqual([
      { variant: 'market-timing', label: 'Market timing', gain: 0.03 },
      { variant: 'pure-anomaly-timing', label: 'Pure anomaly timing', gain: 1.26 },
    ]);
    expect(service.utilityGainRange).toEqual({ from: 1.66, to: 2.96 });
  });

  // --- staleness ------------------------------------------------------------

  it('when a shorter rebalancing interval is selected, the signals read stale', async () => {
    expect(service.staleSignals()).toBe(false);

    service.setRebalancing('monthly');
    await service.settled();

    expect(service.staleSignals()).toBe(true);
    expect(service.staleDetail()).toContain('older than the decision');
  });

  it('when the signals are re-run, they adopt the selected interval and stop being stale', async () => {
    service.setRebalancing('monthly');
    await service.settled();
    expect(service.staleSignals()).toBe(true);

    await service.refresh();

    expect(service.signalCadence()).toBe('monthly');
    expect(service.staleSignals()).toBe(false);
  });

  it('when a longer interval is selected, the signals are not stale', async () => {
    service.setRebalancing('annual');
    await service.settled();

    expect(service.staleSignals()).toBe(false);
  });

  // --- guardrails -----------------------------------------------------------

  it('when the banner is dismissed, it stays down only for the conflict it was dismissed on', async () => {
    expect(service.guardrailVisible()).toBe(true);
    expect(service.conflictKey()).toBe('momentum');

    service.dismissGuardrails();
    expect(service.guardrailVisible()).toBe(false);

    // Two factors that agree on both signals: nothing conflicts, which is a
    // different situation from the one the reader dismissed.
    service.setFactorsInView(['quality', 'low-vol']);
    await service.settled();

    expect(service.conflictedRows()).toEqual([]);
    expect(service.conflictKey()).toBe(NO_CONFLICT_KEY);
    expect(service.guardrailVisible()).toBe(true);
  });

  it('when the conflicted factor changes, the dismissed banner comes back', async () => {
    service.dismissGuardrails();
    expect(service.guardrailVisible()).toBe(false);

    service.setFactorsInView(['value', 'size', 'quality']);
    await service.settled();

    expect(service.conflictKey()).not.toBe('momentum');
    expect(service.guardrailVisible()).toBe(true);
  });

  // --- lifecycle ------------------------------------------------------------

  it('when a toolbar control changes, the page passes through loading', async () => {
    service.setWeighting('static');
    expect(service.state()).toBe('loading');

    await service.settled();
    expect(service.state()).toBe('ready');
  });

  it('when the run fails, the page is in error and the primary action is refused', async () => {
    await service.refresh(true);

    expect(service.state()).toBe('error');
    expect(service.errorMessage()).toBe(LOAD_FAILURE_MESSAGE);
    expect(service.stale()).toBe(true);
    expect(service.canApply()).toBe(false);
    expect(await service.applyTilts()).toBe(false);

    service.clearError();
    expect(service.state()).toBe('ready');
  });

  it('when a run completes, the computed stamp moves on', async () => {
    await service.refresh();
    expect(service.lastComputed()).toBe('2026-07-31 06:01 UTC');
  });

  // --- the hand-off ---------------------------------------------------------

  it('when the tilts are applied, the payload is the Timing % column as it stands', async () => {
    const applied = await service.applyTilts();

    expect(applied).toBe(true);
    const payload = service.applied();
    expect(payload?.targetRoute).toBe(VIEWS_BUILDER_ROUTE);
    expect(payload?.timingModel).toBe('parsimonious');
    expect(payload?.lookbackMonths).toBe(36);
    expect(payload?.tilts.find((tilt) => tilt.factor === 'value')?.timingWeightPct).toBe(16);
    // The excluded factor is not in the hand-off at all.
    expect(payload?.tilts.some((tilt) => tilt.factor === 'profitability')).toBe(false);
  });

  it('when the hand-off fails, the page is not blanked and the failure is its own', async () => {
    const applied = await service.applyTilts(true);

    expect(applied).toBe(false);
    expect(service.errorMessage()).toBe(APPLY_FAILURE_MESSAGE);
    // A failed hand-off is not a failed computation: the page still reads.
    expect(service.loadFailure()).toBeNull();
    expect(service.state()).toBe('ready');
  });

  it('when the snapshot is exported, an excluded factor is named rather than zeroed', () => {
    const csv = service.exportSnapshot();
    const lines = csv.split('\n');

    expect(lines[0]).toContain('timing_pct');
    const profitability = lines.find((line) => line.startsWith('Profitability'));
    expect(profitability).toContain('insufficient history — excluded');
    expect(lines.find((line) => line.startsWith('Momentum'))).toContain(
      'trend vs valuation conflict',
    );
  });

  // --- the excess-return cycles --------------------------------------------

  it('when the cycles are drawn, one line per factor in view spans the whole axis', () => {
    const years = service.excessReturnYears();
    expect(years[0]).toBe(1990);
    expect(years[years.length - 1]).toBe(2026);

    const series = service.excessReturnSeries();
    expect(series.map((entry) => entry.factor)).toEqual(FACTOR_IDS);
    for (const entry of series) expect(entry.values.length).toBe(years.length);
  });

  it('when a factor has no history that far back, the early years are gaps and not zeros', () => {
    const profitability = service
      .excessReturnSeries()
      .find((entry) => entry.factor === 'profitability');

    expect(profitability?.values[0]).toBeNull();
    expect(profitability?.values[profitability.values.length - 1]).not.toBeNull();
    expect(profitability?.values.includes(0)).toBe(false);
  });
});
