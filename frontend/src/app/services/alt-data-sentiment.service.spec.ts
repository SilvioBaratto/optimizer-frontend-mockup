/**
 * The service behind `docs/21 Alternative Data & Sentiment.md`.
 *
 * Four things are worth a unit test rather than a DOM test, because they are
 * invariants of the data and not of any one region:
 *
 * 1. driving the detail panel and being included in the hand-over are separate
 *    state, and neither writer touches the other;
 * 2. a failed feed narrows a signal's window and never removes it;
 * 3. the temporal classification is derived from the evidence under the method
 *    currently chosen, so the news cadence toggle can move it;
 * 4. the ML weights are a distribution — they sum to 100% — and the model that
 *    fails out of sample carries no information coefficient and no weight.
 */

import { TestBed } from '@angular/core/testing';

import {
  AS_OF_DATE,
  SENT_ATTENUATION,
  type AltSignalId,
} from '../models/alt-data-sentiment.model';
import { AltDataSentimentService } from './alt-data-sentiment.service';

/** The service's stand-in latency is 600ms; this outlasts it. */
function settle(ms = 700): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

describe('AltDataSentimentService', () => {
  let service: AltDataSentimentService;

  beforeEach(() => {
    TestBed.configureTestingModule({});
    service = TestBed.inject(AltDataSentimentService);
  });

  function ids(): AltSignalId[] {
    return service.visibleSignals().map((signal) => signal.id);
  }

  // --- the library -----------------------------------------------------------

  it('when the page opens, the six library signals are on the default universe', () => {
    expect(service.state()).toBe('ready');
    expect(ids()).toEqual([
      'media-pessimism',
      'tenk-tone',
      'retail-attention',
      'social-mood',
      'news-analytics',
      'aggregate-sentiment',
    ]);
  });

  it('when the page opens, coverage is stated per signal as the wireframe prints it', () => {
    const coverage = Object.fromEntries(
      service.visibleSignals().map((signal) => [signal.id, signal.coverage]),
    );
    expect(coverage['media-pessimism']).toBe(98);
    expect(coverage['tenk-tone']).toBe(74);
    expect(coverage['retail-attention']).toBe(91);
    expect(coverage['social-mood']).toBe(62);
    expect(coverage['news-analytics']).toBe(95);
    expect(coverage['aggregate-sentiment']).toBe(100);
  });

  it('when a universe reaches fewer names, every coverage percentage moves with it', async () => {
    const before = service.signalById('media-pessimism')?.coverage ?? 0;
    service.setUniverse('europe-mid-cap');
    await service.settled();

    const after = service.signalById('media-pessimism')?.coverage ?? 0;
    expect(after).toBeLessThan(before);
  });

  // --- selection is not inclusion --------------------------------------------

  it('when a card is included, the card driving the detail panel does not change', () => {
    const driving = service.detailSignalId();
    expect(driving).toBe('tenk-tone');

    service.toggleInclude('social-mood');

    expect(service.detailSignalId()).toBe(driving);
    expect(service.isIncluded('social-mood')).toBe(true);
  });

  it('when a card is made to drive the detail panel, the inclusion set does not change', () => {
    const included = [...service.includedIds()];
    expect(included).not.toContain('social-mood');

    service.selectForDetail('social-mood');

    expect(service.detailSignalId()).toBe('social-mood');
    expect([...service.includedIds()]).toEqual(included);
    expect(service.isIncluded('social-mood')).toBe(false);
  });

  it('when the page opens, the card driving the detail is not one of the included ones', () => {
    expect(service.includedCount()).toBe(3);
    expect(service.isIncluded(service.detailSignalId() as AltSignalId)).toBe(false);
  });

  it('when an included card is toggled again, it leaves the hand-over set', () => {
    service.toggleInclude('media-pessimism');
    expect(service.isIncluded('media-pessimism')).toBe(false);
    expect(service.includedCount()).toBe(2);
  });

  // --- feed health -----------------------------------------------------------

  it('when a feed has failed, the signal stays in the library with its last good timestamp', () => {
    const failed = service.signalById('retail-attention');
    expect(failed?.feed).toBe('failed');
    expect(failed?.lastGoodAt).toBe('2026-07-29 18:00 UTC');
    expect(ids()).toContain('retail-attention');
  });

  it('when a feed has failed, the window it covers stops short and the signal reads partial', () => {
    expect(service.signalById('retail-attention')?.partialCoverage).toBe(true);
    expect(service.signalById('retail-attention')?.coverageNote).toContain('2026-07-29');
  });

  it('when a feed has not updated within its cadence, it reads stale rather than failed', () => {
    expect(service.signalById('social-mood')?.feed).toBe('stale');
    expect(service.signalById('media-pessimism')?.feed).toBe('live');
  });

  it('when the feeds are read, the freshness summary counts the stale and failed ones', () => {
    expect(service.staleFeedCount()).toBe(1);
    expect(service.failedFeedCount()).toBe(1);
    expect(service.feedsUpdatedAt()).toContain(AS_OF_DATE);
  });

  // --- filters ---------------------------------------------------------------

  it('when the search field is typed into, only signals whose name matches stay', () => {
    service.setQuery('tone');
    expect(ids()).toEqual(['tenk-tone']);
  });

  it('when a category chip is switched off, its signals leave the grid', () => {
    service.toggleCategory('tone');
    expect(ids()).not.toContain('media-pessimism');
    expect(ids()).not.toContain('tenk-tone');
    expect(service.visibleSignals().length).toBe(4);
  });

  it('when every category but one is off, the last one refuses to switch off', () => {
    for (const category of ['tone', 'attention', 'mood', 'news', 'ml'] as const) {
      service.toggleCategory(category);
    }
    expect(service.activeCategories()).toEqual(['regime']);

    service.toggleCategory('regime');

    expect(service.activeCategories()).toEqual(['regime']);
    expect(ids()).toEqual(['aggregate-sentiment']);
  });

  it('when only the ML chip is on, the grid is empty because no library signal is an aggregate', () => {
    for (const category of ['tone', 'attention', 'mood', 'news', 'regime'] as const) {
      service.toggleCategory(category);
    }
    expect(service.activeCategories()).toEqual(['ml']);
    expect(ids()).toEqual([]);
    expect(service.onlyMlCategory()).toBe(true);
  });

  // --- the coverage window ---------------------------------------------------

  it('when the window ends before it starts, the range is rejected and nothing is recomputed', () => {
    const before = ids();
    service.setCoverageEnd('2014-01-01');

    expect(service.coverageError()).not.toBeNull();
    expect(ids()).toEqual(before);
  });

  it('when the window ends after the last feed update, the range is rejected', () => {
    service.setCoverageEnd('2027-01-01');
    expect(service.coverageError()).not.toBeNull();
  });

  it('when the window lies before every feed, the library is empty rather than filtered', async () => {
    service.setCoverageStart('1960-01-01');
    service.setCoverageEnd('1964-12-31');
    await service.settled();

    expect(service.coverageError()).toBeNull();
    expect(service.state()).toBe('empty');
    expect(ids()).toEqual([]);
  });

  it('when a signal starts inside the window, it is marked partial against that window', () => {
    expect(service.signalById('social-mood')?.partialCoverage).toBe(true);
    expect(service.signalById('media-pessimism')?.partialCoverage).toBe(false);
  });

  // --- the detail panel ------------------------------------------------------

  it('when the tone dictionary changes, the detail panel reports the new combination at once', () => {
    service.selectForDetail('tenk-tone');
    const before = service.detail();
    expect(before?.figure.kind).toBe('tone-methods');
    if (before?.figure.kind !== 'tone-methods') throw new Error('wrong figure');
    expect(before.figure.active.tStat).toBe(-2.64);

    service.setToneDictionary('h4n');

    const after = service.detail();
    if (after?.figure.kind !== 'tone-methods') throw new Error('wrong figure');
    expect(after.figure.active.dictionary).toBe('h4n');
    expect(after.figure.active.tStat).toBe(-0.71);
    expect(after.figure.active.significant).toBe(false);
  });

  it('when a combination the source never estimated is chosen, it reads not reported rather than zero', () => {
    service.selectForDetail('tenk-tone');
    service.setToneWeighting('tfidf');

    const detail = service.detail();
    if (detail?.figure.kind !== 'tone-methods') throw new Error('wrong figure');
    expect(detail.figure.active.tStat).toBeNull();
    expect(detail.figure.active.verdict).toBe('not reported');
  });

  it('when news is aggregated weekly, the classification moves from transient to persistent', () => {
    service.selectForDetail('news-analytics');
    expect(service.detail()?.temporal).toBe('transient');

    service.setNewsAggregation('weekly');

    expect(service.detail()?.temporal).toBe('persistent');
    // The library's own classification is unchanged: it is the summary of both.
    expect(service.signalById('news-analytics')?.temporal).toBe('mixed');
  });

  it('when news is aggregated weekly, the figure runs to thirteen weeks', () => {
    service.selectForDetail('news-analytics');
    service.setNewsAggregation('weekly');

    const detail = service.detail();
    if (detail?.figure.kind !== 'news-cadence') throw new Error('wrong figure');
    expect(detail.figure.points.length).toBe(13);
    expect(detail.figure.points[0].value).toBe(3.75);
  });

  it('when the aggregate index is selected, its loadings are the six market proxies', () => {
    service.selectForDetail('aggregate-sentiment');

    const detail = service.detail();
    if (detail?.figure.kind !== 'loadings') throw new Error('wrong figure');
    expect(detail.figure.loadings.map((l) => l.name)).toEqual([
      'CEFD',
      'TURN',
      'NIPO',
      'RIPO',
      'S',
      'PDND',
    ]);
    expect(detail.crossSectionalLink).toBe(true);
  });

  it('when social mood is selected, the causality table is significant at lags 2 to 6', () => {
    service.selectForDetail('social-mood');

    const detail = service.detail();
    if (detail?.figure.kind !== 'lag-causality') throw new Error('wrong figure');
    const significant = detail.figure.rows.filter((row) => row.significant).map((row) => row.lag);
    expect(significant).toEqual([2, 3, 4, 5, 6]);
  });

  // --- cross-sectional sentiment ---------------------------------------------

  it('when size is read under both regimes, the low-sentiment spread is the wider one', () => {
    const result = service.crossSection();
    expect(result.characteristic).toBe('size');
    expect(result.rows.length).toBe(10);
    expect(result.rows[0].high).toBe(-0.31);
    expect(result.rows[9].high).toBe(-0.44);
    expect(result.rows[0].low).toBe(0.42);
    expect(result.rows[9].low).toBe(0.18);
    expect(Math.abs(result.spreadLow)).toBeGreaterThan(Math.abs(result.spreadHigh));
  });

  it('when the raw index is chosen, every conditional return is attenuated by its macro component', () => {
    const orthogonal = service.crossSection().rows[0].high;
    service.setSentimentBasis('sent');
    const raw = service.crossSection().rows[0].high;

    expect(raw).toBeCloseTo(orthogonal * SENT_ATTENUATION, 2);
  });

  it('when a U-shaped characteristic is chosen, the middle deciles sit nearer zero than the ends', () => {
    service.setCharacteristic('distress');
    const result = service.crossSection();

    expect(result.shape).toBe('u-shaped');
    expect(Math.abs(result.rows[4].high)).toBeLessThan(Math.abs(result.rows[0].high));
    expect(Math.abs(result.rows[4].high)).toBeLessThan(Math.abs(result.rows[9].high));
  });

  it('when the regime toggle moves, the rows are the same and only the reading changes', () => {
    const before = service.crossSection().rows;
    service.setSentimentRegime('low');
    const after = service.crossSection();

    expect(after.regime).toBe('low');
    expect(after.rows).toEqual(before);
  });

  // --- ML aggregation --------------------------------------------------------

  it('when the candidate models are read, their weights are a distribution summing to 100%', () => {
    const total = service.mlModels.reduce((sum, model) => sum + model.weight, 0);
    expect(total).toBe(100);
  });

  it('when a model fails out of sample, it carries no information coefficient and no weight', () => {
    const ols = service.mlModels.find((model) => model.id === 'ols');
    expect(ols?.r2Oos).toBeLessThan(0);
    expect(ols?.ic).toBeNull();
    expect(ols?.weight).toBe(0);
  });

  it('when the models are ranked, the best out-of-sample R² also carries the largest weight', () => {
    const byR2 = [...service.mlModels].sort((a, b) => b.r2Oos - a.r2Oos);
    const byWeight = [...service.mlModels].sort((a, b) => b.weight - a.weight);
    expect(byR2[0].id).toBe('nn3');
    expect(byWeight[0].id).toBe('nn3');
  });

  it('when the score weighting changes, the Sharpe ratios move and the R² does not', () => {
    const valueWeighted = service.aggregate();
    expect(valueWeighted.aggregate.sharpe).toBe(1.35);
    expect(valueWeighted.bestComponent.sharpe).toBe(0.61);

    service.setScoreWeighting('equal-weighted');
    const equalWeighted = service.aggregate();

    expect(equalWeighted.aggregate.sharpe).toBe(2.45);
    expect(equalWeighted.bestComponent.sharpe).toBe(0.83);
    expect(equalWeighted.aggregate.r2Oos).toBe(valueWeighted.aggregate.r2Oos);
  });

  it('when the aggregate is compared with its best component, it wins on both measures', () => {
    for (const weighting of ['value-weighted', 'equal-weighted'] as const) {
      service.setScoreWeighting(weighting);
      const comparison = service.aggregate();
      expect(comparison.aggregate.r2Oos).toBeGreaterThan(comparison.bestComponent.r2Oos);
      expect(comparison.aggregate.sharpe).toBeGreaterThan(comparison.bestComponent.sharpe);
    }
  });

  // --- lifecycle -------------------------------------------------------------

  it('when a tab is opened, its panel loads before it shows anything', async () => {
    service.setTab('ml-aggregation');
    expect(service.tab()).toBe('ml-aggregation');
    expect(service.panelLoading()).toBe(true);

    await service.settled();

    expect(service.panelLoading()).toBe(false);
  });

  it('when the universe changes, the whole page recomputes rather than one panel', async () => {
    service.setUniverse('us-large-cap');
    expect(service.state()).toBe('loading');

    await service.settled();

    expect(service.state()).toBe('ready');
  });

  it('when a universe has no alternative-data feed at all, the page is empty', async () => {
    service.setUniverse('em-frontier-small');
    await service.settled();

    expect(service.state()).toBe('empty');
    expect(ids()).toEqual([]);
  });

  it('when the load fails, the page reports the failure and recovers on retry', async () => {
    await service.refresh(true);

    expect(service.state()).toBe('error');
    expect(service.errorMessage()).not.toBeNull();

    service.clearError();
    await service.refresh();

    expect(service.state()).toBe('ready');
    expect(service.errorMessage()).toBeNull();
  });

  it('when a refresh is already in flight, a second one does not start', async () => {
    const first = service.refresh();
    const second = service.refresh();
    await Promise.all([first, second, settle()]);

    expect(service.state()).toBe('ready');
  });
});
