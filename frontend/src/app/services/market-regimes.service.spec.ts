import { TestBed } from '@angular/core/testing';

import {
  ASYMMETRY_TOLERANCE,
  CORRELATION_NOTE_LABEL,
  CRASH_RISK_VOLATILITY_THRESHOLD,
  FACTOR_COUNTS,
  LOW_CONFIDENCE_BAND_PCT,
  MARKET_REGIME_MODELS,
  MIN_SAMPLE_MONTHS,
  MOMENTUM_LOOKBACKS,
  MOMENTUM_MARKET_STATES,
  PROBABILITY_BASES,
  REGIME_MODELS,
  SIZE_PREMIUM_NOT_SPECIFIED,
  VALUE_VOLATILITY_STATES,
  VALUE_VOLATILITY_STATE_LABEL,
  VIEWS_BUILDER_ROUTE,
  type MarketRegimeModelId,
  type RegimeUniverseId,
} from '../models/market-regimes.model';
import { MarketRegimesService } from './market-regimes.service';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function setup(): MarketRegimesService {
  TestBed.resetTestingModule();
  TestBed.configureTestingModule({});
  return TestBed.inject(MarketRegimesService);
}

/** Runs every timer the service scheduled, then lets the caller's work settle. */
async function settle(service: MarketRegimesService, work?: Promise<unknown>): Promise<void> {
  await vi.advanceTimersByTimeAsync(5_000);
  if (work) await work;
  await service.settled();
}

const UNIVERSE_IDS: readonly RegimeUniverseId[] = [
  'equities-bonds',
  'equities-only',
  'global-multi-asset',
];

function sum(values: readonly number[]): number {
  return values.reduce((total, value) => total + value, 0);
}

function statesOfSharedModel(id: MarketRegimeModelId): readonly string[] {
  const found = REGIME_MODELS.find((definition) => definition.id === id);
  if (!found) throw new Error(`no shared definition for ${id}`);
  return found.states;
}

function normalise(label: string): string {
  return label.trim().toLowerCase();
}

beforeEach(() => {
  vi.useFakeTimers();
});

afterEach(() => {
  vi.useRealTimers();
});

// ===========================================================================
// Criterion — three separate state vocabularies that must not blend
// ===========================================================================

describe('MarketRegimesService — the three state vocabularies stay apart', () => {
  it('when every panel is read, no state label belongs to two vocabularies', () => {
    const service = setup();

    const regimeModelStates = new Set<string>(
      [
        ...statesOfSharedModel('four-state'),
        ...statesOfSharedModel('hamilton'),
        ...service.sizePremium().map((row) => row.state),
      ].map(normalise),
    );
    const valueStates = new Set<string>(
      VALUE_VOLATILITY_STATES.flatMap((state) => [
        normalise(state),
        normalise(VALUE_VOLATILITY_STATE_LABEL[state]),
      ]),
    );
    const momentumStates = new Set<string>(MOMENTUM_MARKET_STATES.map(normalise));

    for (const label of valueStates) expect(regimeModelStates.has(label)).toBe(false);
    for (const label of momentumStates) expect(regimeModelStates.has(label)).toBe(false);
    for (const label of momentumStates) expect(valueStates.has(label)).toBe(false);
  });

  it('when a row is read, it names the vocabulary it belongs to', () => {
    const service = setup();

    for (const reading of service.stateReadings()) expect(reading.vocabulary).toBe('regime-model');
    for (const row of service.regimeStatistics()) expect(row.vocabulary).toBe('regime-model');
    for (const row of service.sizePremium()) expect(row.vocabulary).toBe('regime-model');
    for (const row of service.valuePremium()) expect(row.vocabulary).toBe('value-volatility');
    expect(service.momentum().vocabulary).toBe('momentum-market');
    for (const profit of service.momentum().profits) {
      expect(profit.vocabulary).toBe('momentum-market');
    }
    expect(service.dominantState()?.vocabulary).toBe('regime-model');
  });

  it('when the size premium and the value premium sit side by side, no row of one lines up with a row of the other', () => {
    const service = setup();

    const sizeStates = service.sizePremium().map((row) => normalise(row.state));
    const valueStates = service.valuePremium().map((row) => normalise(row.state));

    expect(sizeStates).toHaveLength(4);
    expect(valueStates).toHaveLength(2);
    for (const state of valueStates) expect(sizeStates).not.toContain(state);
  });

  it("when momentum reports its state, it is neither a regime-model state nor a volatility state", async () => {
    const service = setup();

    for (const lookback of MOMENTUM_LOOKBACKS) {
      service.setMomentumLookback(lookback);
      const state = normalise(service.momentum().state);
      expect(MOMENTUM_MARKET_STATES.map(normalise)).toContain(state);
      expect(service.modelStates().map(normalise)).not.toContain(state);
      expect(VALUE_VOLATILITY_STATES.map(normalise)).not.toContain(state);
    }

    await settle(service);
  });
});

// ===========================================================================
// Criterion — the regime vocabulary is the shared one, not a second copy
// ===========================================================================

describe('MarketRegimesService — the regime vocabulary comes from the shared model', () => {
  it('when a model is selected, its states are exactly the ones the shared REGIME_MODELS declares', async () => {
    const service = setup();

    for (const model of MARKET_REGIME_MODELS) {
      service.setModel(model);
      expect(service.modelStates()).toEqual(statesOfSharedModel(model));
      expect(service.stateReadings().map((reading) => reading.name)).toEqual(
        statesOfSharedModel(model),
      );
    }

    await settle(service);
  });

  it('when the size premium is drawn, it uses the shared four-state names', () => {
    const service = setup();

    expect(service.sizePremium().map((row) => row.state)).toEqual(statesOfSharedModel('four-state'));
  });
});

// ===========================================================================
// Criterion — switching the model recomposes three panels and no others
// ===========================================================================

describe('MarketRegimesService — switching to the Hamilton model', () => {
  it('when the Hamilton model is selected, the hero, the path and the statistics drop to two states', async () => {
    const service = setup();

    expect(service.stateReadings()).toHaveLength(4);
    expect(service.probabilityPath()).toHaveLength(4);
    expect(service.regimeStatistics()).toHaveLength(4);

    service.setModel('hamilton');

    expect(service.stateReadings()).toHaveLength(2);
    expect(service.probabilityPath()).toHaveLength(2);
    expect(service.regimeStatistics()).toHaveLength(2);
    expect(service.dominantState()?.model).toBe('hamilton');

    await settle(service);
  });

  it('when the Hamilton model is selected, the size premium keeps its four regimes and the value premium its own two', async () => {
    const service = setup();

    const sizeBefore = service.sizePremium();
    const valueBefore = service.valuePremium();

    service.setModel('hamilton');

    expect(service.sizePremium()).toEqual(sizeBefore);
    expect(service.sizePremium()).toHaveLength(4);
    expect(service.sizePremium().every((row) => row.model === 'four-state')).toBe(true);
    expect(service.valuePremium()).toEqual(valueBefore);
    expect(service.valuePremium().map((row) => row.state)).toEqual([...VALUE_VOLATILITY_STATES]);

    await settle(service);
  });

  it('when the model changes, the size premium regimes are still absent from the hero', async () => {
    const service = setup();
    service.setModel('hamilton');

    const heroStates = service.stateReadings().map((reading) => reading.name);
    const sizeStates = service.sizePremium().map((row) => row.state);

    expect(heroStates).toEqual(['Recession', 'Expansion']);
    for (const state of heroStates) expect(sizeStates).not.toContain(state);

    await settle(service);
  });
});

// ===========================================================================
// Criterion — the bridge direction is derived, never set
// ===========================================================================

describe('MarketRegimesService — the regime-implied view', () => {
  it('when the dominant state changes, the implied direction changes with it', async () => {
    const service = setup();

    expect(service.dominantState()?.state).toBe('Crash');
    expect(service.regimeImpliedView()?.direction).toBe('defensive');

    service.setUniverse('equities-only');
    expect(service.dominantState()?.state).toBe('Bull');
    expect(service.regimeImpliedView()?.direction).toBe('risk-on');

    service.setUniverse('global-multi-asset');
    expect(service.dominantState()?.state).toBe('Slow Growth');
    expect(service.regimeImpliedView()?.direction).toBe('neutral');

    await settle(service);
  });

  it('when the view is read, it names the dominant state and its probability, never another one', async () => {
    const service = setup();

    for (const model of MARKET_REGIME_MODELS) {
      for (const universe of UNIVERSE_IDS) {
        service.setModel(model);
        service.setUniverse(universe);

        const dominant = service.dominantState();
        const view = service.regimeImpliedView();
        expect(view).not.toBeNull();
        expect(view?.derivedFromState).toBe(dominant?.state);
        expect(view?.derivedFromProbability).toBe(dominant?.probability);
        expect(view?.targetRoute).toBe(VIEWS_BUILDER_ROUTE);
      }
    }

    await settle(service);
  });

  it('when the service is inspected, nothing can set the implied view or its direction', () => {
    const service = setup();

    const view = service.regimeImpliedView as unknown as Record<string, unknown>;
    expect(view['set']).toBeUndefined();
    expect(view['update']).toBeUndefined();

    const methods = Object.getOwnPropertyNames(Object.getPrototypeOf(service));
    const setters = methods.filter((name) => /^set/.test(name) && /view|direction/i.test(name));
    expect(setters).toEqual([]);
  });

  it('when the direction is a defensive one, the draft view lowers returns and raises correlations', () => {
    const service = setup();

    const view = service.regimeImpliedView();
    expect(view?.expectedReturns).toBe('lower expected returns');
    expect(view?.correlations).toBe('higher correlations');
    expect(view?.covariance).toBe('widened covariance');
    expect(view?.summary).toBe(
      'lower expected returns · higher correlations · widened covariance',
    );
  });

  it('when the view is sent, what lands is the direction the hero was showing', async () => {
    const service = setup();
    service.setUniverse('equities-only');
    await settle(service);

    const sending = service.sendView();
    expect(service.sendingView()).toBe(true);
    await settle(service, sending);

    expect(service.sentView()?.state).toBe('Bull');
    expect(service.sentView()?.direction).toBe('risk-on');
    expect(service.errorMessage()).toBeNull();
  });

  it('when there is no estimate, there is no view to send', async () => {
    const service = setup();
    service.setUniverse('em-equities');
    await settle(service);

    expect(service.regimeImpliedView()).toBeNull();
    expect(service.canSendView()).toBe(false);
    await expect(service.sendView()).resolves.toBe(false);
  });

  it('when the hand-over fails, it says so and writes nothing', async () => {
    const service = setup();

    await settle(service, service.sendView(true));

    expect(service.sentView()).toBeNull();
    expect(service.sendErrorMessage()).not.toBeNull();
    expect(service.sendErrorDetail()).not.toBeNull();
  });

  it('when the hand-over fails, the estimate is untouched and the page stays ready', async () => {
    const service = setup();

    await settle(service, service.sendView(true));

    // The two failures are different events: a hand-over that did not land says
    // nothing about the filter, so the page must not enter its error state and
    // the bridge card's Preview must stay live.
    expect(service.errorMessage()).toBeNull();
    expect(service.state()).toBe('ready');
    expect(service.regimeImpliedView()).not.toBeNull();
    expect(service.canSendView()).toBe(true);
  });
});

// ===========================================================================
// Criterion — nothing the substance leaves open is invented
// ===========================================================================

describe('MarketRegimesService — unspecified quantities are null, never zero', () => {
  it('when a regime the substance does not fix is read, its correlation is null', () => {
    const service = setup();

    const rows = service.regimeStatistics();
    const crash = rows.find((row) => row.state === 'Crash');
    const slowGrowth = rows.find((row) => row.state === 'Slow Growth');
    const bull = rows.find((row) => row.state === 'Bull');
    const recovery = rows.find((row) => row.state === 'Recovery');

    expect(crash?.largeSmall.value).toBe(0.82);
    expect(recovery?.largeSmall.value).toBe(0.5);
    expect(slowGrowth?.largeSmall.value).toBeNull();
    expect(bull?.largeSmall.value).toBeNull();
    expect(slowGrowth?.largeSmall.note).toBe('not-fixed');
    expect(CORRELATION_NOTE_LABEL['not-fixed']).toBe('—');

    expect(crash?.equityBond.value).toBe(-0.4);
    expect(slowGrowth?.equityBond.value).toBeNull();
    expect(slowGrowth?.equityBond.note).toBe('positive');
  });

  it('when a cell is read, it carries a number or a note — never both, never neither', async () => {
    const service = setup();

    for (const model of MARKET_REGIME_MODELS) {
      for (const universe of UNIVERSE_IDS) {
        service.setModel(model);
        service.setUniverse(universe);

        for (const row of service.regimeStatistics()) {
          for (const cell of [row.largeSmall, row.equityBond]) {
            expect(cell.value === null).toBe(cell.note !== null);
          }
        }
      }
    }

    await settle(service);
  });

  it('when the universe carries no Large and Small series, the column says n/d rather than estimating one', async () => {
    const service = setup();
    service.setUniverse('global-multi-asset');

    for (const row of service.regimeStatistics()) {
      expect(row.largeSmall.value).toBeNull();
      expect(row.largeSmall.note).toBe('series-missing');
      expect(CORRELATION_NOTE_LABEL['series-missing']).toBe('n/d');
    }

    await settle(service);
  });

  it('when the universe carries no bonds, the Equity–Bond column says n/d', async () => {
    const service = setup();
    service.setUniverse('equities-only');

    for (const row of service.regimeStatistics()) {
      expect(row.equityBond.note).toBe('series-missing');
    }

    await settle(service);
  });

  it('when the size premium is drawn, Recovery is null and not zero', () => {
    const service = setup();

    const rows = service.sizePremium();
    const recovery = rows.find((row) => row.state === 'Recovery');

    expect(recovery?.premiumBp).toBeNull();
    expect(recovery?.premiumBp).not.toBe(0);
    expect(recovery?.note).toBe(SIZE_PREMIUM_NOT_SPECIFIED);

    expect(rows.find((row) => row.state === 'Crash')?.premiumBp).toBe(100);
    expect(rows.find((row) => row.state === 'Slow Growth')?.premiumBp).toBe(-61);
    expect(rows.find((row) => row.state === 'Bull')?.premiumBp).toBe(71);
  });

  it('when the spread across regimes is taken, it skips the regime that has no estimate', () => {
    const service = setup();

    expect(service.sizePremiumSpreadBp()).toBe(161);
  });

  it('when the long-horizon momentum profit is read, its CAPM-adjusted figure is null rather than zero', () => {
    const service = setup();

    const reversal = service
      .momentum()
      .profits.find((profit) => profit.horizon === 'months-13-60');

    expect(reversal?.rawPerMonth).toBe(-0.36);
    expect(reversal?.capmAdjustedPerMonth).toBeNull();
    expect(reversal?.reversal).toBe(true);
  });
});

// ===========================================================================
// Criterion — the momentum crash flag is a composite boolean
// ===========================================================================

describe('MarketRegimesService — the momentum crash-risk flag', () => {
  it('when only the bear state holds, the flag stays off', async () => {
    const service = setup();
    service.setUniverse('equities-bonds');
    service.setMomentumLookback(12);

    const crash = service.momentum().crashRisk;
    expect(service.momentum().state).toBe('DOWN');
    expect(crash.bearState).toBe(true);
    expect(crash.highVolatility).toBe(false);
    expect(crash.armed).toBe(false);

    await settle(service);
  });

  it('when only the volatility is high, the flag stays off', async () => {
    const service = setup();
    service.setUniverse('equities-only');
    service.setMomentumLookback(36);

    const crash = service.momentum().crashRisk;
    expect(service.momentum().state).toBe('UP');
    expect(crash.bearState).toBe(false);
    expect(crash.highVolatility).toBe(true);
    expect(crash.armed).toBe(false);

    await settle(service);
  });

  it('when a bear state and high volatility hold together, the flag arms', async () => {
    const service = setup();
    service.setUniverse('equities-only');
    service.setMomentumLookback(12);

    const crash = service.momentum().crashRisk;
    expect(crash.bearState).toBe(true);
    expect(crash.highVolatility).toBe(true);
    expect(crash.armed).toBe(true);
    expect(crash.reason).toContain('armed');

    await settle(service);
  });

  it('when neither condition holds, the flag is off and says both are needed', async () => {
    const service = setup();
    service.setUniverse('global-multi-asset');
    service.setMomentumLookback(36);

    const crash = service.momentum().crashRisk;
    expect(crash.bearState).toBe(false);
    expect(crash.highVolatility).toBe(false);
    expect(crash.armed).toBe(false);
    expect(crash.reason).toContain('AND');

    await settle(service);
  });

  it('across every universe and lookback, the flag is exactly the conjunction and never a score', async () => {
    const service = setup();

    for (const universe of UNIVERSE_IDS) {
      for (const lookback of MOMENTUM_LOOKBACKS) {
        service.setUniverse(universe);
        service.setMomentumLookback(lookback);

        const momentum = service.momentum();
        const crash = momentum.crashRisk;
        expect(typeof crash.armed).toBe('boolean');
        expect(crash.bearState).toBe(momentum.state === 'DOWN');
        expect(crash.highVolatility).toBe(
          crash.realisedVolatility > CRASH_RISK_VOLATILITY_THRESHOLD,
        );
        expect(crash.armed).toBe(crash.bearState && crash.highVolatility);
      }
    }

    await settle(service);
  });

  it('when the lookback changes, the state follows the sign of the cumulative market return', async () => {
    const service = setup();

    for (const lookback of MOMENTUM_LOOKBACKS) {
      service.setMomentumLookback(lookback);
      const momentum = service.momentum();
      expect(momentum.state).toBe(momentum.cumulativeMarketReturn >= 0 ? 'UP' : 'DOWN');
    }

    await settle(service);
  });
});

// ===========================================================================
// Criterion — the macro nowcast and its vintage
// ===========================================================================

describe('MarketRegimesService — the macro nowcast', () => {
  it('when the vintage is no older than the filter reference month, nothing is flagged', () => {
    const service = setup();

    expect(service.filterReferenceMonth()).toBe('2026-07');
    expect(service.nowcast().vintage).toBe('2026-07-28');
    expect(service.nowcast().staleVintage).toBe(false);
  });

  it('when the filter moves past the vintage, the stale flag is set', async () => {
    const service = setup();

    service.setSampleTo('2026-08');

    expect(service.nowcast().staleVintage).toBe(true);
    expect(service.nowcast().filterReferenceMonth).toBe('2026-08');

    await settle(service);
  });

  it('when the factor count changes, only the explained variance and the loading bands move', async () => {
    const service = setup();

    for (const count of FACTOR_COUNTS) {
      service.setFactorCount(count);
      const nowcast = service.nowcast();
      expect(nowcast.factorCount).toBe(count);
      expect(nowcast.gdpGrowthQoq).toBe(1.4);
    }

    service.setFactorCount(6);
    expect(service.nowcast().explainedVariance).toBe(39);
    expect(service.nowcast().loadings).toHaveLength(2);

    service.setFactorCount(12);
    expect(service.nowcast().explainedVariance).toBe(53);
    expect(service.nowcast().loadings).toHaveLength(3);
    expect(service.nowcast().loadings[2].blocks).toEqual([]);
    expect(service.nowcast().loadings[2].note).not.toBeNull();

    await settle(service);
  });

  it('when the uncertainty is split, each half carries a word beside its share', () => {
    const service = setup();

    const nowcast = service.nowcast();
    expect(nowcast.commonUncertaintyLevel).toBe('high');
    expect(nowcast.idiosyncraticUncertaintyLevel).toBe('low');
    expect(nowcast.releases).toHaveLength(3);
  });

  it('when the regime model or the universe changes, the nowcast does not move', async () => {
    const service = setup();
    const before = service.nowcast();

    service.setModel('hamilton');
    service.setUniverse('equities-only');

    expect(service.nowcast()).toEqual(before);

    await settle(service);
  });
});

// ===========================================================================
// Criterion — the probability path
// ===========================================================================

describe('MarketRegimesService — the probability path', () => {
  it('when the path is drawn, the bands close at 100 at every month', async () => {
    const service = setup();

    for (const model of MARKET_REGIME_MODELS) {
      for (const universe of UNIVERSE_IDS) {
        for (const basis of PROBABILITY_BASES) {
          service.setModel(model);
          service.setUniverse(universe);
          service.setProbabilityBasis(basis);

          const bands = service.probabilityPath();
          const months = service.probabilityPathMonths();
          expect(bands.length).toBeGreaterThan(0);
          expect(months.length).toBeGreaterThan(MIN_SAMPLE_MONTHS);

          for (let t = 0; t < months.length; t++) {
            expect(sum(bands.map((band) => band.probabilities[t]))).toBeCloseTo(100, 6);
          }
        }
      }
    }

    await settle(service);
  });

  it('when the path ends, its last month is the reading the hero card shows', async () => {
    const service = setup();

    for (const basis of PROBABILITY_BASES) {
      service.setProbabilityBasis(basis);
      const bands = service.probabilityPath();
      const last = bands[0].probabilities.length - 1;
      const readings = service.stateReadings();

      bands.forEach((band, i) => {
        expect(band.state).toBe(readings[i].name);
        expect(band.probabilities[last]).toBe(readings[i].probability);
      });
    }

    await settle(service);
  });

  it('when the hero says "most likely since", that is where the unbroken run starts', async () => {
    const service = setup();

    for (const model of MARKET_REGIME_MODELS) {
      for (const universe of UNIVERSE_IDS) {
        service.setModel(model);
        service.setUniverse(universe);

        const dominant = service.dominantState();
        const months = service.probabilityPathMonths();
        const bands = service.probabilityPath();
        expect(dominant).not.toBeNull();

        const start = months.indexOf(dominant!.mostLikelySince);
        expect(start).toBeGreaterThan(0);

        const leaderAt = (t: number): string => {
          let best = 0;
          for (let i = 1; i < bands.length; i++) {
            if (bands[i].probabilities[t] > bands[best].probabilities[t]) best = i;
          }
          return bands[best].state;
        };

        for (let t = start; t < months.length; t++) {
          expect(leaderAt(t)).toBe(dominant!.state);
        }
        expect(leaderAt(start - 1)).not.toBe(dominant!.state);
      }
    }

    await settle(service);
  });

  it('when the smoothed basis is chosen, the last month of the sample does not move', async () => {
    const service = setup();

    const filtered = service.stateReadings().map((reading) => reading.probability);
    service.setProbabilityBasis('smoothed');
    const smoothed = service.stateReadings().map((reading) => reading.probability);

    expect(sum(filtered)).toBeCloseTo(100, 6);
    expect(sum(smoothed)).toBeCloseTo(100, 6);
    // At t = T the smoother's information set is the filter's — there is no
    // future left to condition on — so P[s_T | I_T] IS the filtered reading.
    // A toggle that changed today's probability would be claiming otherwise.
    expect(smoothed).toEqual(filtered);
    expect(service.dominantState()?.basis).toBe('smoothed');

    await settle(service);
  });

  it('when the smoothed basis is chosen, the path behind the last month is revised and sharper', async () => {
    const service = setup();

    const bandsOf = () => service.probabilityPath().map((band) => band.probabilities);
    const filtered = bandsOf();
    service.setProbabilityBasis('smoothed');
    const smoothed = bandsOf();

    const months = filtered[0].length;
    expect(months).toBeGreaterThan(24);

    // The endpoint is identical band for band, and so is the month the current
    // run began — the hero card names it, and it may not depend on the basis.
    for (let band = 0; band < filtered.length; band++) {
      expect(smoothed[band][months - 1]).toBe(filtered[band][months - 1]);
      expect(smoothed[band][months - 3]).toBe(filtered[band][months - 3]);
    }

    // …and the interior is not: hindsight resolves the undecided months, so the
    // leading state's share is higher on average than the filter's.
    const leadShare = (bands: readonly (readonly number[])[]) => {
      let total = 0;
      for (let t = 0; t < months - 1; t++) total += Math.max(...bands.map((band) => band[t]));
      return total / (months - 1);
    };
    expect(leadShare(smoothed)).toBeGreaterThan(leadShare(filtered));

    // Still a probability vector at every month.
    for (let t = 0; t < months; t++) {
      expect(sum(smoothed.map((band) => band[t]))).toBeCloseTo(100, 6);
    }

    await settle(service);
  });
});

// ===========================================================================
// Criterion — exceedance correlations and the asymmetry only one model catches
// ===========================================================================

describe('MarketRegimesService — the correlation diagnostic', () => {
  it('when the empirical curve is read, its asymmetry runs the way the pair declares', async () => {
    const service = setup();

    for (const universe of UNIVERSE_IDS) {
      service.setUniverse(universe);
      for (const pair of service.availablePairs()) {
        service.setPair(pair.id);
        const empirical = service.exceedanceSeries().find((series) => series.isReference);
        expect(empirical).toBeDefined();

        const positive = empirical!.points.filter((point) => point.theta > 0);
        for (const point of positive) {
          const mirrored = empirical!.points.find(
            (candidate) => Math.abs(candidate.theta + point.theta) < 1e-9,
          );
          expect(mirrored).toBeDefined();
          if (pair.downsideExceedance === 'higher') {
            expect(mirrored!.correlation).toBeGreaterThan(point.correlation);
          } else {
            expect(mirrored!.correlation).toBeLessThan(point.correlation);
          }
        }
      }
    }

    await settle(service);
  });

  it('when the models are compared, only the regime-switching one reproduces the asymmetry', async () => {
    const service = setup();

    for (const universe of UNIVERSE_IDS) {
      service.setUniverse(universe);
      for (const pair of service.availablePairs()) {
        service.setPair(pair.id);
        const series = service.exceedanceSeries();

        const empirical = series.find((entry) => entry.model === 'empirical');
        const regime = series.find((entry) => entry.model === 'regime-switching');
        const normal = series.find((entry) => entry.model === 'normal');
        const garch = series.find((entry) => entry.model === 'asymmetric-garch');

        expect(empirical?.reproducesAsymmetry).toBeNull();
        expect(regime?.reproducesAsymmetry).toBe(true);
        expect(normal?.reproducesAsymmetry).toBe(false);
        expect(garch?.reproducesAsymmetry).toBe(false);

        expect(normal?.asymmetryGap).toBeCloseTo(0, 6);
        expect(Math.abs((garch?.asymmetryGap ?? 0) - (empirical?.asymmetryGap ?? 0))).toBeGreaterThan(
          ASYMMETRY_TOLERANCE,
        );
      }
    }

    await settle(service);
  });

  it('when the slider sits at a theta, every series is read off at that same theta', async () => {
    const service = setup();

    service.setTheta(-1.5);
    const readings = service.exceedanceAtTheta();

    expect(readings).toHaveLength(4);
    for (const reading of readings) expect(reading.theta).toBe(-1.5);

    await settle(service);
  });

  it('when theta is pushed past the ends of the slider, it is held at them', () => {
    const service = setup();

    service.setTheta(9);
    expect(service.theta()).toBe(2);
    service.setTheta(-9);
    expect(service.theta()).toBe(-2);
  });

  it('when the universe has no pair for the diagnostic, the chart has no series to draw', async () => {
    const service = setup();
    service.setUniverse('em-equities');

    expect(service.pair()).toBeNull();
    expect(service.exceedanceSeries()).toEqual([]);

    await settle(service);
  });

  it('when the universe loses the pair the diagnostic was showing, the selector falls back to one it has', async () => {
    const service = setup();
    expect(service.pair()?.id).toBe('large-small');

    service.setUniverse('global-multi-asset');

    expect(service.universe().pairs).not.toContain('large-small');
    expect(service.pair()?.id).toBe('equity-bond');

    await settle(service);
  });
});

// ===========================================================================
// Criterion — the toolbar, the empty window and the failure path
// ===========================================================================

describe('MarketRegimesService — toolbar, states and diagnostics', () => {
  it('when the page opens, it shows the reading the spec writes down', () => {
    const service = setup();

    expect(service.state()).toBe('ready');
    expect(service.model()).toBe('four-state');
    expect(service.universeId()).toBe('equities-bonds');
    expect(service.probabilityBasis()).toBe('filtered');
    expect(service.sampleFrom()).toBe('1990-01');
    expect(service.sampleTo()).toBe('2026-07');
    expect(service.lastUpdated()).toBe('2026-07-31 08:12');

    const dominant = service.dominantState();
    expect(dominant?.state).toBe('Crash');
    expect(dominant?.probability).toBe(58);
    expect(dominant?.stationaryProbability).toBe(9);
    expect(dominant?.expectedDurationMonths).toBe(2);
    expect(dominant?.mostLikelySince).toBe('2026-06');

    expect(service.diagnostics().logLikelihood).toBe(-1284.6);
    expect(service.diagnostics().lastCalibration).toBe('2026-06-30');
  });

  it('when the highest probability sits near a half, the footer warns in words', async () => {
    const service = setup();

    expect(service.diagnostics().topProbability).toBe(58);
    expect(Math.abs(58 - 50)).toBeLessThanOrEqual(LOW_CONFIDENCE_BAND_PCT);
    expect(service.diagnostics().lowFilterConfidence).toBe(true);
    expect(service.diagnostics().note).not.toBeNull();

    service.setModel('hamilton');
    expect(service.diagnostics().topProbability).toBe(61);
    expect(service.diagnostics().lowFilterConfidence).toBe(false);
    expect(service.diagnostics().note).toBeNull();

    await settle(service);
  });

  it('when the sample start does not precede its end, the window is refused and the page empties', async () => {
    const service = setup();

    service.setSampleFrom('2026-08');

    expect(service.sampleWindowValid()).toBe(false);
    expect(service.sampleWindowError()).not.toBeNull();
    expect(service.emptyReason()).toBe('invalid-window');
    expect(service.state()).toBe('empty');
    expect(service.stateReadings()).toEqual([]);
    expect(service.probabilityPath()).toEqual([]);
    expect(service.regimeStatistics()).toEqual([]);
    expect(service.dominantState()).toBeNull();

    await settle(service);
  });

  it('when the universe is younger than the filter needs, the page says there is no sample', async () => {
    const service = setup();

    service.setUniverse('em-equities');
    await settle(service);

    expect(service.effectiveSampleFrom()).toBe('2025-06');
    expect(service.effectiveSampleMonths()).toBeLessThan(MIN_SAMPLE_MONTHS);
    expect(service.emptyReason()).toBe('insufficient-history');
    expect(service.state()).toBe('empty');
    expect(service.emptyDetail()).not.toBeNull();
    expect(service.stateReadings()).toEqual([]);
    expect(service.diagnostics().logLikelihood).toBeNull();
    expect(service.diagnostics().topProbability).toBeNull();
  });

  it('when the sample window narrows, the estimate is re-run and the reading moves', async () => {
    const service = setup();
    const before = service.stateReadings().map((reading) => reading.probability);

    service.setSampleFrom('2020-01');
    expect(service.state()).toBe('loading');
    await settle(service);
    expect(service.state()).toBe('ready');

    const after = service.stateReadings().map((reading) => reading.probability);
    expect(after).not.toEqual(before);
    expect(sum(after)).toBeCloseTo(100, 6);
  });

  it('when the run fails, the last good panels stay on screen and are called stale', async () => {
    const service = setup();

    await settle(service, service.refresh(true));

    expect(service.state()).toBe('error');
    expect(service.errorMessage()).not.toBeNull();
    expect(service.errorDetail()).not.toBeNull();
    expect(service.stale()).toBe(true);
    expect(service.stateReadings()).toHaveLength(4);
    expect(service.canSendView()).toBe(false);

    service.clearError();
    expect(service.state()).toBe('ready');
    expect(service.canSendView()).toBe(true);
  });

  it('when a toolbar control moves, the page is busy until the run lands', async () => {
    const service = setup();

    service.setModel('hamilton');
    expect(service.state()).toBe('loading');
    expect(service.loading()).toBe(true);

    await settle(service);

    expect(service.loading()).toBe(false);
    expect(service.state()).toBe('ready');
    expect(service.lastUpdated()).toBe('2026-07-31 08:13');
  });

  it('when the statistics are read on a riskier universe, the conditional moments widen with it', async () => {
    const service = setup();
    const reference = service.regimeStatistics().find((row) => row.state === 'Crash');

    service.setUniverse('equities-only');
    const riskier = service.regimeStatistics().find((row) => row.state === 'Crash');

    expect(riskier!.volatility).toBeGreaterThan(reference!.volatility);
    expect(riskier!.stationaryProbability).toBe(reference!.stationaryProbability);

    await settle(service);
  });
});
