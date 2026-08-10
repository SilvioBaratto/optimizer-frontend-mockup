import { TestBed } from '@angular/core/testing';

import {
  DISPLAY_RANGES,
  PC1_SATURATION_MONTHS,
  TURBULENCE_PANELS,
} from '../models/turbulence.model';
import {
  CORE_UNIVERSE_ID,
  RECENT_UNIVERSE_ID,
  SLEEVE_UNIVERSE_ID,
  TurbulenceService,
  YOUNG_UNIVERSE_ID,
  chiSquaredThreshold,
  pairwiseSurpriseOf,
} from './turbulence.service';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function setup(): TurbulenceService {
  TestBed.configureTestingModule({});
  return TestBed.inject(TurbulenceService);
}

/** Runs every pending timer the service scheduled, then lets it settle. */
async function settle(work?: Promise<void>): Promise<void> {
  await vi.advanceTimersByTimeAsync(5_000);
  if (work) await work;
}

function sum(values: readonly number[]): number {
  return values.reduce((a, b) => a + b, 0);
}

/** Every current reading the page prints, in one comparable object. */
function readings(service: TurbulenceService): Record<string, number> {
  return {
    turbulence: service.reading().turbulence,
    turbulenceRaw: service.reading().turbulenceRaw,
    magnitude: service.reading().magnitudeSurprise,
    correlation: service.reading().correlationSurprise,
    threshold: service.reading().threshold,
    absorptionRatio: service.absorption().absorptionRatio,
    averageCorrelation: service.absorption().averageCorrelation,
    deltaSigma: service.absorption().deltaSigma,
    effectiveRank: service.effectiveRank().effectiveRank,
    participationRatio: service.participation().participationRatio,
    pc1Share: service.pc1().share,
    lambda1: service.spectrum().eigenvalues[0].value,
    gammaPlus: service.spectrum().gammaPlus,
  };
}

beforeEach(() => {
  vi.useFakeTimers();
});

afterEach(() => {
  vi.useRealTimers();
});

// ===========================================================================
// Criterion — the χ² threshold is a function of the asset count
// ===========================================================================

describe('TurbulenceService — the χ² threshold moves with the universe', () => {
  it('when twelve series are measured, the threshold is the 14.84 of the source', () => {
    expect(chiSquaredThreshold(12)).toBeCloseTo(14.84, 1);
  });

  it('when the asset count grows, the threshold grows with it', () => {
    const thresholds = [4, 8, 12, 24, 40].map(chiSquaredThreshold);

    expect(thresholds).toEqual([...thresholds].sort((a, b) => a - b));
    for (const value of thresholds) expect(value).toBeGreaterThan(0);
  });

  it('when the page opens on 24 assets, the threshold is the one for 24 degrees of freedom', () => {
    const service = setup();

    expect(service.assetCount()).toBe(24);
    expect(service.threshold()).toBeCloseTo(chiSquaredThreshold(24), 9);
    expect(service.threshold()).not.toBeCloseTo(chiSquaredThreshold(12), 1);
    expect(service.reading().thresholdNote).toContain('24');
  });

  it('when the universe changes size, the threshold line moves with it', () => {
    const service = setup();
    const at24 = service.threshold();

    service.selectUniverse(SLEEVE_UNIVERSE_ID);

    expect(service.assetCount()).toBe(12);
    expect(service.threshold()).not.toBe(at24);
    expect(service.threshold()).toBeCloseTo(chiSquaredThreshold(12), 9);
    expect(service.threshold()).toBeCloseTo(14.84, 1);
    expect(service.reading().thresholdNote).toContain('12');
  });

  it('when the threshold is read on either scale, the outlier verdict is the same', () => {
    const service = setup();

    for (const id of [CORE_UNIVERSE_ID, SLEEVE_UNIVERSE_ID]) {
      service.selectUniverse(id);
      const reading = service.reading();
      expect(reading.thresholdNormalized).toBeCloseTo(reading.threshold / reading.assetCount, 9);
      expect(reading.turbulenceRaw).toBeCloseTo(reading.turbulence * reading.assetCount, 9);
      expect(reading.outlier, id).toBe(reading.turbulenceRaw > reading.threshold);
      expect(reading.outlier, id).toBe(reading.turbulence > reading.thresholdNormalized);
    }
  });

  it('when the universe changes size, the shaded outlier bands are re-cut against the new line', () => {
    const service = setup();
    service.setDisplayRange('Max');
    const marked = (s: TurbulenceService) => s.turbulenceSeries().filter((p) => p.outlier).length;
    const at24 = marked(service);

    service.selectUniverse(SLEEVE_UNIVERSE_ID);

    expect(service.thresholdNormalized()).not.toBeCloseTo(chiSquaredThreshold(24) / 24, 6);
    expect(marked(service)).not.toBe(at24);
    for (const point of service.turbulenceSeries()) {
      expect(point.outlier).toBe(point.turbulence > service.thresholdNormalized());
    }
  });
});

// ===========================================================================
// Criterion — correlation surprise is defined for a pair only
// ===========================================================================

describe('TurbulenceService — the pairwise inspector', () => {
  it('when the page opens, the pair is the first two assets in alphabetical order', () => {
    const service = setup();
    const alphabetical = [...service.assetIds()].sort();

    expect(service.assetX()).toBe(alphabetical[0]);
    expect(service.assetY()).toBe(alphabetical[1]);
    expect(service.assetX()).not.toBe(service.assetY());
  });

  it('when Asset X is set to the asset already in Y, the selection is rejected and said so', () => {
    const service = setup();
    const y = service.assetY();

    const accepted = service.selectAssetX(y);

    expect(accepted).toBe(false);
    expect(service.assetX()).not.toBe(y);
    expect(service.pairNote()).not.toBeNull();
    expect(service.pairNote()).toContain('differ');
  });

  it('when Asset Y is set to the asset already in X, the selection is rejected too', () => {
    const service = setup();
    const x = service.assetX();
    const before = service.assetY();

    const accepted = service.selectAssetY(x);

    expect(accepted).toBe(false);
    expect(service.assetY()).toBe(before);
    expect(service.pairNote()).toContain('differ');
  });

  it('when a different asset is chosen, the rejection note clears and the pair updates', () => {
    const service = setup();
    service.selectAssetX(service.assetY());

    const accepted = service.selectAssetX('HY_CREDIT');

    expect(accepted).toBe(true);
    expect(service.assetX()).toBe('HY_CREDIT');
    expect(service.pairNote()).toBeNull();
  });

  it('when the pair is read, the surprise and its bounds come from the printed z-scores and ρ', () => {
    const service = setup();
    service.selectAssetX('EQ_US_LARGE');
    service.selectAssetY('HY_CREDIT');

    const pair = service.pairwise();
    const expected = pairwiseSurpriseOf(pair.zX, pair.zY, pair.rho);

    expect(pair.correlationSurprise).toBeCloseTo(expected.correlationSurprise, 12);
    expect(pair.min).toBeCloseTo((1 - Math.abs(pair.rho)) / (1 - pair.rho ** 2), 12);
    expect(pair.max).toBeCloseTo((1 + Math.abs(pair.rho)) / (1 - pair.rho ** 2), 12);
  });

  it('when the pair is read, the surprise stays inside the bounds the formula guarantees', () => {
    const service = setup();
    const ids = service.assetIds();

    for (const x of ids) {
      for (const y of ids) {
        if (x === y) continue;
        service.selectAssetX(x);
        service.selectAssetY(y);
        const pair = service.pairwise();
        expect(pair.correlationSurprise, `${x}/${y}`).toBeGreaterThanOrEqual(pair.min - 1e-12);
        expect(pair.correlationSurprise, `${x}/${y}`).toBeLessThanOrEqual(pair.max + 1e-12);
        expect(pair.position, `${x}/${y}`).toBeGreaterThanOrEqual(0);
        expect(pair.position, `${x}/${y}`).toBeLessThanOrEqual(1);
        expect(pair.breakdown, `${x}/${y}`).toBe(pair.correlationSurprise > 1);
      }
    }
  });

  it('when the pair is swapped, the surprise is the same — it has no direction', () => {
    const service = setup();
    service.selectAssetX('EQ_US_LARGE');
    service.selectAssetY('GOV_10Y');
    const forward = service.pairwise().correlationSurprise;

    service.selectAssetX('GOV_10Y');
    service.selectAssetY('EQ_US_LARGE');

    expect(service.pairwise().correlationSurprise).toBeCloseTo(forward, 12);
  });

  it('when the doc’s worked pair is inspected, the closed form is what the panel reports', () => {
    const exact = pairwiseSurpriseOf(1.9, 2.2, 0.42);

    expect(exact.correlationSurprise).toBeCloseTo(0.7097, 3);
    expect(exact.min).toBeCloseTo(0.7042, 3);
    expect(exact.max).toBeCloseTo(1.7241, 3);
  });

  it('when ρ is zero, the bounds coincide at one and no surprise is possible', () => {
    const exact = pairwiseSurpriseOf(1.4, -0.7, 0);

    expect(exact.min).toBeCloseTo(1, 12);
    expect(exact.max).toBeCloseTo(1, 12);
    expect(exact.correlationSurprise).toBeCloseTo(1, 12);
  });

  it('when the universe shrinks, a pair that is no longer in it is replaced, never left dangling', () => {
    const service = setup();
    service.selectAssetX('EQ_US_LARGE');
    service.selectAssetY('HY_CREDIT');

    service.selectUniverse(SLEEVE_UNIVERSE_ID);

    expect(service.assetIds()).toContain(service.assetX());
    expect(service.assetIds()).toContain(service.assetY());
    expect(service.assetX()).not.toBe(service.assetY());
  });
});

// ===========================================================================
// Criterion — the display range never touches an estimation window
// ===========================================================================

describe('TurbulenceService — the display range is a display window', () => {
  it('when the range changes, no estimation window and no current reading moves', () => {
    const service = setup();
    const windows = service.windows();
    const before = readings(service);

    for (const range of DISPLAY_RANGES) {
      service.setDisplayRange(range);
      expect(service.windows(), range).toEqual(windows);
      expect(readings(service), range).toEqual(before);
      expect(service.snapshot().windows, range).toEqual(windows);
    }
  });

  it('when the range widens, the three historical charts draw more of the same series', () => {
    const service = setup();
    service.setDisplayRange('6M');
    const short = {
      turbulence: service.turbulenceSeries().length,
      absorption: service.absorptionSeries().length,
      effectiveRank: service.effectiveRankSeries().length,
    };

    service.setDisplayRange('Max');

    expect(service.turbulenceSeries().length).toBeGreaterThan(short.turbulence);
    expect(service.absorptionSeries().length).toBeGreaterThan(short.absorption);
    expect(service.effectiveRankSeries().length).toBeGreaterThan(short.effectiveRank);
  });

  it('when the range narrows, the visible series is the tail of the wider one', () => {
    const service = setup();
    service.setDisplayRange('Max');
    const whole = service.turbulenceSeries();

    service.setDisplayRange('1Y');
    const year = service.turbulenceSeries();

    expect(year).toEqual(whole.slice(whole.length - year.length));
    expect(year[year.length - 1].turbulence).toBe(service.reading().turbulence);
  });

  it('when the range changes, the panels the field spec leaves alone do not move', () => {
    const service = setup();
    service.setDisplayRange('6M');
    const participation = service.participationSeries();
    const pc1 = service.pc1Series();
    const spectrum = service.spectrum();

    service.setDisplayRange('5Y');

    expect(service.participationSeries()).toEqual(participation);
    expect(service.pc1Series()).toEqual(pc1);
    expect(service.spectrum()).toEqual(spectrum);
  });

  it('when the range changes, the page never enters a loading state — nothing is recomputed', async () => {
    const service = setup();
    const refresh = vi.spyOn(service, 'refresh');

    service.setDisplayRange('3Y');

    expect(service.state()).toBe('ready');
    await settle();
    expect(refresh).not.toHaveBeenCalled();
    expect(service.state()).toBe('ready');
  });

  it('when the threshold overlay is hidden, the readings and the bands underneath are untouched', () => {
    const service = setup();
    const before = readings(service);
    const bands = service.outlierPeriods();

    service.setShowThresholdAndBands(false);

    expect(service.showThresholdAndBands()).toBe(false);
    expect(readings(service)).toEqual(before);
    expect(service.outlierPeriods()).toEqual(bands);
  });
});

// ===========================================================================
// Criterion — partial coverage is reported, never silently dropped
// ===========================================================================

describe('TurbulenceService — partial coverage', () => {
  it('when every asset covers the window, no panel claims partial coverage', () => {
    const service = setup();

    expect(service.absorptionCoverage().partial).toBe(false);
    expect(service.absorptionCoverage().label).toBeNull();
    expect(service.correlationCoverage().partial).toBe(false);
    expect(service.absorptionCoverage().covered).toBe(service.assetCount());
  });

  it('when some assets are younger than a window, the panel says N/M and keeps its value', () => {
    const service = setup();

    service.selectUniverse(RECENT_UNIVERSE_ID);

    const coverage = service.correlationCoverage();
    expect(coverage.partial).toBe(true);
    expect(coverage.covered).toBeLessThan(coverage.total);
    expect(coverage.total).toBe(service.assetCount());
    expect(coverage.label).toBe(`Partial coverage — ${coverage.covered}/${coverage.total} assets`);

    // The value is still there — that is the whole point of the badge.
    expect(service.spectrum().eigenvalues.length).toBe(service.assetCount());
    expect(service.pairwise().correlationSurprise).toBeGreaterThan(0);
    expect(service.state()).toBe('ready');
  });

  it('when a window is short enough for every asset, that panel reports full cover while another does not', () => {
    const service = setup();

    service.selectUniverse(RECENT_UNIVERSE_ID);

    expect(service.absorptionCoverage().partial).toBe(false);
    expect(service.absorptionCoverage().label).toBeNull();
    expect(service.correlationCoverage().partial).toBe(true);
    expect(service.absorption().absorptionRatio).toBeGreaterThan(0);
  });

  it('when an asset is short of the window, the contributor row says so and stays in the table', () => {
    const service = setup();
    service.selectUniverse(RECENT_UNIVERSE_ID);

    const rows = service.contributors();
    expect(rows.length).toBe(service.assetCount());
    expect(rows.some((row) => !row.covered)).toBe(true);
    expect(sum(rows.map((row) => row.contribution))).toBeCloseTo(1, 9);
  });

  it('when no asset reaches any window, the page is empty and names the missing window', () => {
    const service = setup();

    service.selectUniverse(YOUNG_UNIVERSE_ID);

    expect(service.state()).toBe('empty');
    expect(service.emptyReason()).toBe('insufficient-history');
  });

  it('when no universe is selected, the page is empty for the other reason', () => {
    const service = setup();

    service.selectUniverse(null);

    expect(service.state()).toBe('empty');
    expect(service.emptyReason()).toBe('no-universe');
  });
});

// ===========================================================================
// Criterion — a failed panel does not blank its neighbours
// ===========================================================================

describe('TurbulenceService — per-panel failure', () => {
  it('when one panel fails, only that panel is in error', async () => {
    const service = setup();

    await settle(service.refreshPanel('absorption', true));

    expect(service.panelStatus().absorption).toBe('error');
    expect(service.errorFor('absorption')?.message).toBeTruthy();
    expect(service.errorFor('absorption')?.detail).toBeTruthy();
    for (const panel of TURBULENCE_PANELS) {
      if (panel === 'absorption') continue;
      expect(service.panelStatus()[panel], panel).toBe('ready');
      expect(service.errorFor(panel), panel).toBeNull();
    }
  });

  it('when one panel fails, every other panel still has its data', async () => {
    const service = setup();
    const before = {
      turbulence: service.turbulenceSeries(),
      contributors: service.contributors(),
      spectrum: service.spectrum(),
      participation: service.participationSeries(),
      pc1: service.pc1Series(),
      effectiveRank: service.effectiveRankSeries(),
      readings: readings(service),
    };

    await settle(service.refreshPanel('absorption', true));

    expect(service.turbulenceSeries()).toEqual(before.turbulence);
    expect(service.contributors()).toEqual(before.contributors);
    expect(service.spectrum()).toEqual(before.spectrum);
    expect(service.participationSeries()).toEqual(before.participation);
    expect(service.pc1Series()).toEqual(before.pc1);
    expect(service.effectiveRankSeries()).toEqual(before.effectiveRank);
    expect(readings(service)).toEqual(before.readings);
    expect(service.state()).toBe('ready');
  });

  it('when a panel fails, its own retry recovers it and leaves the rest alone', async () => {
    const service = setup();
    await settle(service.refreshPanel('spectrum', true));

    const retry = service.refreshPanel('spectrum');
    expect(service.panelStatus().spectrum).toBe('loading');
    expect(service.panelStatus().turbulence).toBe('ready');
    await settle(retry);

    expect(service.panelStatus().spectrum).toBe('ready');
    expect(service.errorFor('spectrum')).toBeNull();
  });

  it('when two panels fail independently, each keeps its own message', async () => {
    const service = setup();

    await settle(service.refreshPanel('pairwise', true));
    await settle(service.refreshPanel('pc1-growth', true));

    expect(
      service
        .panelErrors()
        .map((e) => e.panel)
        .sort(),
    ).toEqual(['pairwise', 'pc1-growth']);
    expect(service.errorFor('pairwise')?.message).not.toBe(service.errorFor('pc1-growth')?.message);
    expect(service.state()).toBe('ready');
  });

  it('when every panel fails, the page as a whole is in error', async () => {
    const service = setup();

    await settle(service.refresh(true));

    expect(service.panelErrors().length).toBe(TURBULENCE_PANELS.length);
    expect(service.state()).toBe('error');

    service.clearError();
    expect(service.state()).toBe('ready');
    expect(service.panelErrors()).toHaveLength(0);
  });

  it('when the whole page refreshes, every panel loads and the snapshot advances', async () => {
    const service = setup();
    const asOf = service.snapshot().asOf;

    const work = service.refresh();
    expect(service.state()).toBe('loading');
    for (const panel of TURBULENCE_PANELS) {
      expect(service.panelStatus()[panel], panel).toBe('loading');
    }
    await settle(work);

    expect(service.state()).toBe('ready');
    expect(service.snapshot().asOf).not.toBe(asOf);
    expect(service.snapshot().ageHours).toBe(0);
  });
});

// ===========================================================================
// Criterion — the PC1 lookback saturates rather than going quiet
// ===========================================================================

describe('TurbulenceService — PC1 growth', () => {
  it('when the page opens, the lookback and horizon are the specified defaults', () => {
    const service = setup();

    expect(service.pc1Lookback()).toBe(12);
    expect(service.pc1Horizon()).toBe(1);
    expect(service.pc1().saturated).toBe(false);
    expect(service.pc1SaturationWarning()).toBeNull();
  });

  it('when the lookback passes the saturation point, the panel warns instead of going quiet', () => {
    const service = setup();

    service.setPc1Lookback(PC1_SATURATION_MONTHS + 4);

    expect(service.pc1().saturated).toBe(true);
    expect(service.pc1SaturationWarning()).not.toBeNull();
    expect(service.pc1SaturationWarning()).toContain('saturates');
  });

  it('when the lookback is past saturation, a longer one changes nothing — which is the point', () => {
    const service = setup();
    service.setPc1Lookback(PC1_SATURATION_MONTHS);
    const atSaturation = service.pc1Series().map((p) => p.share);

    service.setPc1Lookback(PC1_SATURATION_MONTHS + 12);

    expect(service.pc1Series().map((p) => p.share)).toEqual(atSaturation);
    expect(service.pc1().saturated).toBe(true);
  });

  it('when the lookback is inside the usable range, it does move the series', () => {
    const service = setup();
    const at12 = service.pc1Series().map((p) => p.share);

    service.setPc1Lookback(6);

    expect(service.pc1Series().map((p) => p.share)).not.toEqual(at12);
    expect(service.pc1().saturated).toBe(false);
  });

  it('when a lookback outside the allowed range is asked for, it is clamped to a positive integer', () => {
    const service = setup();

    service.setPc1Lookback(0);
    expect(service.pc1Lookback()).toBeGreaterThanOrEqual(1);

    service.setPc1Lookback(4.7);
    expect(Number.isInteger(service.pc1Lookback())).toBe(true);

    service.setPc1Lookback(9_999);
    expect(service.pc1Lookback()).toBeLessThanOrEqual(36);
  });

  it('when ΔPC1 is read, it is the difference the horizon defines and its peak is the sample maximum', () => {
    const service = setup();

    const series = service.pc1Series();
    const m = service.pc1Horizon();
    for (let i = 0; i < series.length; i++) {
      if (i < m) {
        expect(series[i].delta).toBeNull();
        continue;
      }
      expect(series[i].delta).toBeCloseTo(series[i].share - series[i - m].share, 12);
    }

    const deltas = series.map((p) => p.delta).filter((d): d is number => d !== null);
    expect(service.pc1().peakDelta).toBeCloseTo(Math.max(...deltas), 12);
    const peak = series.find((p) => p.delta === service.pc1().peakDelta);
    expect(service.pc1().peakMonth).toBe(peak?.month);
  });

  it('when the current ΔPC1 is placed, its decile is read off the same distribution the chart bins', () => {
    const service = setup();

    const pc1 = service.pc1();
    expect(pc1.decile).toBeGreaterThanOrEqual(1);
    expect(pc1.decile).toBeLessThanOrEqual(10);
    expect(pc1.decile).toBe(10);

    const bins = service.pc1Distribution();
    expect(bins.filter((b) => b.current)).toHaveLength(1);
    expect(sum(bins.map((b) => b.count))).toBe(
      service.pc1Series().filter((p) => p.delta !== null).length,
    );
    const current = bins.find((b) => b.current)!;
    expect(pc1.delta).toBeGreaterThanOrEqual(current.from);
    expect(pc1.delta).toBeLessThanOrEqual(current.to);
  });

  it('when the horizon changes, the deltas and the distribution follow it', () => {
    const service = setup();
    const before = service.pc1Distribution();

    service.setPc1Horizon(6);

    expect(service.pc1Horizon()).toBe(6);
    expect(service.pc1().horizonMonths).toBe(6);
    expect(service.pc1Distribution()).not.toEqual(before);
  });
});

// ===========================================================================
// Criterion — the decomposition identity, at every point of the series
// ===========================================================================

describe('TurbulenceService — turbulence and its decomposition', () => {
  it('when any point of the series is read, turbulence is magnitude × correlation surprise', () => {
    const service = setup();
    service.setDisplayRange('Max');

    for (const point of service.turbulenceSeries()) {
      expect(point.turbulence, point.date).toBeCloseTo(
        point.magnitudeSurprise * point.correlationSurprise,
        12,
      );
      expect(point.magnitudeSurprise, point.date).toBeGreaterThan(0);
      expect(point.correlationSurprise, point.date).toBeGreaterThan(0);
    }
  });

  it('when the current reading is printed, it is the last point of the series it sits above', () => {
    const service = setup();
    service.setDisplayRange('Max');
    const last = service.turbulenceSeries()[service.turbulenceSeries().length - 1];
    const reading = service.reading();

    expect(reading.date).toBe(last.date);
    expect(reading.turbulence).toBe(last.turbulence);
    expect(reading.magnitudeSurprise).toBe(last.magnitudeSurprise);
    expect(reading.correlationSurprise).toBe(last.correlationSurprise);
    expect(reading.turbulence).toBeCloseTo(2.31, 9);
    expect(reading.magnitudeSurprise).toBeCloseTo(1.84, 9);
    expect(reading.correlationSurprise).toBeCloseTo(2.31 / 1.84, 12);
  });

  it('when the outlier bands are cut, each covers a run the series really is above the line for', () => {
    const service = setup();
    service.setDisplayRange('Max');

    const periods = service.outlierPeriods();
    expect(periods.length).toBeGreaterThan(1);
    const series = service.turbulenceSeries();
    for (const period of periods) {
      const from = series.findIndex((p) => p.date === period.from);
      const to = series.findIndex((p) => p.date === period.to);
      expect(from, period.from).toBeGreaterThanOrEqual(0);
      expect(to, period.to).toBeGreaterThanOrEqual(from);
      expect(period.observations).toBe(to - from + 1);
      for (let i = from; i <= to; i++) expect(series[i].outlier, series[i].date).toBe(true);
      if (from > 0) expect(series[from - 1].outlier).toBe(false);
      if (to < series.length - 1) expect(series[to + 1].outlier).toBe(false);
    }
    expect(periods[periods.length - 1].open).toBe(true);
  });

  it('when the series checkboxes are used, the last remaining series cannot be turned off', () => {
    const service = setup();

    expect(service.visibleSeries()).toEqual(['turbulence', 'magnitude']);
    service.toggleSeries('magnitude');
    expect(service.visibleSeries()).toEqual(['turbulence']);

    service.toggleSeries('turbulence');

    expect(service.visibleSeries()).toEqual(['turbulence']);
    expect(service.seriesNote()).not.toBeNull();
  });

  it('when a contributor table is read, the shares make one whole and the sort is honoured', () => {
    const service = setup();

    expect(sum(service.contributors().map((r) => r.contribution))).toBeCloseTo(1, 9);
    const byZ = service.contributors().map((r) => Math.abs(r.zScore));
    expect(byZ).toEqual([...byZ].sort((a, b) => b - a));
    expect(service.topContributors()).toHaveLength(5);
    expect(service.topContributors()[0].asset).toBe('HY_CREDIT');

    service.setContributorSort('asset');
    const names = service.contributors().map((r) => r.asset);
    expect(names).toEqual([...names].sort());

    service.setContributorSort('contribution');
    const shares = service.contributors().map((r) => r.contribution);
    expect(shares).toEqual([...shares].sort((a, b) => b - a));
  });
});

// ===========================================================================
// Criterion — the compactness family is one spectrum seen five ways
// ===========================================================================

describe('TurbulenceService — compactness', () => {
  it('when the spectrum is read, the eigenvalues sum to the asset count', () => {
    const service = setup();

    for (const id of [CORE_UNIVERSE_ID, SLEEVE_UNIVERSE_ID]) {
      service.selectUniverse(id);
      const spectrum = service.spectrum();
      expect(spectrum.eigenvalues, id).toHaveLength(service.assetCount());
      expect(sum(spectrum.eigenvalues.map((e) => e.value)), id).toBeCloseTo(
        service.assetCount(),
        9,
      );
      const values = spectrum.eigenvalues.map((e) => e.value);
      expect(values, id).toEqual([...values].sort((a, b) => b - a));
    }
  });

  it('when the bulk is compared with the spectrum, the counts follow the bounds they name', () => {
    const service = setup();
    const spectrum = service.spectrum();

    expect(spectrum.gammaPlus).toBeGreaterThan(spectrum.gammaMinus);
    expect(spectrum.q).toBeCloseTo(spectrum.observations / spectrum.assets, 12);
    expect(spectrum.aboveBound).toBe(
      spectrum.eigenvalues.filter((e) => e.value > spectrum.gammaPlus).length,
    );
    expect(spectrum.significant).toBe(spectrum.eigenvalues.filter((e) => e.value > 1).length);
    expect(spectrum.aboveBound).toBe(3);
  });

  it('when the absorption ratio and the PC1 share are read, both come off that spectrum', () => {
    const service = setup();
    const spectrum = service.spectrum();
    const n = service.windows().absorptionEigenvectors;

    const absorbed = sum(spectrum.eigenvalues.slice(0, n).map((e) => e.value));
    expect(service.absorption().absorptionRatio).toBeCloseTo(absorbed / service.assetCount(), 9);
    expect(service.pc1().share).toBeCloseTo(spectrum.eigenvalues[0].varianceShare, 9);
    expect(service.absorption().absorptionRatio).toBeCloseTo(0.71, 2);
    expect(service.pc1().share).toBeCloseTo(0.52, 2);
  });

  it('when the effective rank is read, it is the entropy of the same normalised eigenvalues', () => {
    const service = setup();
    const spectrum = service.spectrum();

    const entropy = -sum(
      spectrum.eigenvalues.map((e) => {
        const p = e.value / service.assetCount();
        return p > 0 ? p * Math.log(p) : 0;
      }),
    );
    expect(service.effectiveRank().effectiveRank).toBeCloseTo(Math.exp(entropy), 9);
    expect(service.effectiveRank().effectiveRank).toBeGreaterThanOrEqual(1);
    expect(service.effectiveRank().effectiveRank).toBeLessThanOrEqual(service.assetCount());
    expect(service.effectiveRank().rawRank).toBe(service.assetCount());
  });

  it('when the participation ratio is read, it is 1/I₁ of the PC1 weights the table prints', () => {
    const service = setup();

    const weights = service.pc1Weights();
    expect(sum(weights.map((w) => w.weight ** 2))).toBeCloseTo(1, 9);
    const i1 = sum(weights.map((w) => w.weight ** 4));
    expect(service.participation().inverseParticipationRatio).toBeCloseTo(i1, 12);
    expect(service.participation().participationRatio).toBeCloseTo(1 / i1, 9);
    expect(service.participation().participationRatio).toBeGreaterThanOrEqual(1);
    expect(service.participation().participationRatio).toBeLessThanOrEqual(service.assetCount());
    expect(service.participation().state).toBe('localized');
    expect(sum(weights.map((w) => w.contributionToI1))).toBeCloseTo(1, 9);
  });

  it('when the significant-component count is shown, it is the spectrum’s own Kaiser-Guttman count', () => {
    const service = setup();

    expect(service.participation().significantComponents).toBe(service.spectrum().significant);
  });

  it('when the absorption series is read, its spikes are the standardised shifts of one σ', () => {
    const service = setup();
    service.setDisplayRange('Max');

    for (const point of service.absorptionSeries()) {
      expect(point.absorptionRatio, point.date).toBeGreaterThan(0);
      expect(point.absorptionRatio, point.date).toBeLessThan(1);
      expect(point.spike, point.date).toBe(point.deltaSigma !== null && point.deltaSigma >= 1);
    }
    const early = service.absorptionSeries()[0];
    expect(early.deltaSigma).toBeNull();
    expect(service.absorption().deltaSigma).toBeCloseTo(1.2, 1);
    expect(service.absorption().spike).toBe(true);
    expect(service.absorption().averageCorrelation).toBeLessThan(
      service.absorption().absorptionRatio,
    );
  });

  it('when the spectrum window changes, the panel follows without touching the other panels', () => {
    const service = setup();
    const first = service.spectrum();
    const other = service.spectrumWindows.find((w) => w.id !== service.spectrumWindowId())!;
    const turbulence = service.turbulenceSeries();

    service.setSpectrumWindow(other.id);

    expect(service.spectrumWindowId()).toBe(other.id);
    expect(service.spectrum().endingOn).toBe(other.endingOn);
    expect(service.spectrum().eigenvalues[0].value).not.toBe(first.eigenvalues[0].value);
    expect(service.turbulenceSeries()).toEqual(turbulence);
  });

  it('when an unknown spectrum window is asked for, the selection is left alone', () => {
    const service = setup();
    const current = service.spectrumWindowId();

    service.setSpectrumWindow('1999-01-01');

    expect(service.spectrumWindowId()).toBe(current);
  });
});

// ===========================================================================
// Criterion — the CURRENT READING grid says what it means
// ===========================================================================

describe('TurbulenceService — the indicator cards', () => {
  it('when the grid is built, it holds the six indicators in wireframe order', () => {
    const service = setup();

    expect(service.indicators().map((card) => card.id)).toEqual([
      'turbulence',
      'magnitude-surprise',
      'correlation-surprise',
      'absorption-ratio',
      'effective-rank',
      'pc1-share',
    ]);
  });

  it('when a card raises an alert, a badge names the quantity that raised it', () => {
    const service = setup();

    for (const card of service.indicators()) {
      expect(card.icon, card.id).toBe(card.alert ? '●' : '○');
      if (card.alert) expect(card.badge, card.id).toBeTruthy();
      else expect(card.badge, card.id).toBeNull();
    }

    const turbulence = service.indicators()[0];
    expect(turbulence.alert).toBe(true);
    expect(turbulence.badge).toContain('threshold');
    expect(turbulence.value).toBe('2.31');
  });

  it('when the absorption card is alerted, the badge names ΔAR and not the twelve-month note', () => {
    const service = setup();
    const card = service.indicators().find((c) => c.id === 'absorption-ratio')!;

    expect(card.alert).toBe(service.absorption().spike);
    expect(card.badge).toContain('15d');
    expect(card.badge).toContain('σ');
  });

  it('when the turbulence sits below its threshold, no card claims it is above', () => {
    const service = setup();

    service.selectUniverse(SLEEVE_UNIVERSE_ID);

    const reading = service.reading();
    const card = service.indicators()[0];
    expect(card.alert).toBe(reading.outlier);
    expect(card.icon).toBe(reading.outlier ? '●' : '○');
  });
});

// ===========================================================================
// Criterion — the as-of bar
// ===========================================================================

describe('TurbulenceService — the snapshot', () => {
  it('when the page opens, the as-of bar reports the specified windows and a fresh snapshot', () => {
    const service = setup();
    const snapshot = service.snapshot();

    expect(snapshot.assetCount).toBe(24);
    expect(snapshot.windows.absorptionDays).toBe(500);
    expect(snapshot.windows.correlationObservations).toBe(100);
    expect(snapshot.windows.absorptionEigenvectors).toBe(5);
    expect(snapshot.ageHours).toBe(18);
    expect(snapshot.stale).toBe(false);
    expect(snapshot.ageNote).toContain('18h');
  });

  it('when the snapshot is older than the cadence, the bar says so beside the stamp', () => {
    const service = setup();

    service.ageSnapshot(40);

    expect(service.snapshot().stale).toBe(true);
    expect(service.snapshot().ageNote).toContain('older than');
  });

  it('when the universe changes, the asset count in the bar follows it', () => {
    const service = setup();

    service.selectUniverse(SLEEVE_UNIVERSE_ID);

    expect(service.snapshot().assetCount).toBe(12);
    expect(service.windows().absorptionEigenvectors).toBe(2);
  });
});
