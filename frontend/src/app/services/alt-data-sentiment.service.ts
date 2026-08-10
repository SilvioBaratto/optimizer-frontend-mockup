import { Injectable, computed, signal } from '@angular/core';

import {
  AS_OF_DATE,
  AS_OF_LABEL,
  COVERAGE_END_DEFAULT,
  COVERAGE_MIN_DATE,
  COVERAGE_END_IN_FUTURE,
  COVERAGE_RANGE_INVALID,
  COVERAGE_START_DEFAULT,
  FEED_CADENCE_DAYS,
  H4N_MISCLASSIFICATION_NOTE,
  LOAD_FAILURE_DETAIL,
  LOAD_FAILURE_MESSAGE,
  SENT_ATTENUATION,
  SENTIMENT_BASIS_VARIANCE,
  SIGNAL_CATEGORIES,
  STALENESS_TOLERANCE,
  TEMPORAL_LABEL,
  TONE_DICTIONARY_SHORT,
  TONE_NOT_REPORTED,
  TONE_WEIGHTING_LABEL,
  type AggregateComparison,
  type AltDataTab,
  type AltSignal,
  type AltSignalId,
  type CrossSectionResult,
  type DecileRow,
  type DecileShape,
  type FeedCadence,
  type FeedHealth,
  type FirmCharacteristic,
  type MlModelRow,
  type NewsAggregation,
  type ResponsePoint,
  type ScoreWeighting,
  type SentimentBasis,
  type SentimentLoading,
  type SentimentRegime,
  type SignalCategory,
  type SignalDetailView,
  type SignalFigure,
  type SignalMethod,
  type ToneCombination,
  type ToneDictionary,
  type ToneWeighting,
  type UniverseOption,
} from '../models/alt-data-sentiment.model';

export type PageState = 'empty' | 'loading' | 'ready' | 'error';

/** Stand-in latency for a whole-page read, so the loading state is reachable. */
const LATENCY_MS = 600;

/** A tab swap re-reads one panel rather than the page, so it lands sooner. */
const PANEL_LATENCY_MS = 300;

// ---------------------------------------------------------------------------
// Scope
// ---------------------------------------------------------------------------

const UNIVERSES: readonly UniverseOption[] = [
  {
    id: 'global-equity-core',
    name: 'Global Equity Core',
    detail: '1,284 names · developed markets',
    altDataCoverage: true,
    coverageFactor: 1,
  },
  {
    id: 'us-large-cap',
    name: 'US Large Cap',
    detail: '503 names · the most heavily covered end of the tape',
    altDataCoverage: true,
    coverageFactor: 1.06,
  },
  {
    id: 'europe-mid-cap',
    name: 'Europe Mid Cap',
    detail: '412 names · thinner English-language news flow',
    altDataCoverage: true,
    coverageFactor: 0.79,
  },
  {
    id: 'em-frontier-small',
    name: 'EM Frontier Small Cap',
    detail: '318 names · no alternative-data feed reaches this universe',
    altDataCoverage: false,
    coverageFactor: 0,
  },
];

// ---------------------------------------------------------------------------
// The signal library
// ---------------------------------------------------------------------------

/**
 * One signal as the library holds it, before the universe and the coverage
 * window are applied.
 *
 * `baseCoverage` is the share of a fully covered universe the feed reaches;
 * what the card prints is that number scaled by the universe. `availableFrom`
 * and `feedStopsAt` bound the window the feed actually spans, and a failed feed
 * is the reason the second is ever earlier than the as-of date.
 */
interface SignalSeed {
  readonly id: AltSignalId;
  readonly name: string;
  readonly category: SignalCategory;
  readonly categoryLabel: string;
  readonly source: string;
  readonly summary: string;
  readonly baseCoverage: number;
  readonly availableFrom: string;
  /** Last date the feed has data for. Short of the as-of date when it failed. */
  readonly feedStopsAt: string;
  readonly updatedAt: string;
  readonly cadence: FeedCadence;
  readonly feedFailed: boolean;
  readonly lastGoodAt: string | null;
  readonly temporal: AltSignal['temporal'];
  readonly method: SignalMethod;
}

const SIGNAL_SEEDS: readonly SignalSeed[] = [
  {
    id: 'media-pessimism',
    name: 'Media Pessimism (WSJ)',
    category: 'tone',
    categoryLabel: 'Media tone',
    source: 'Daily Wall Street Journal market column · Harvard IV-4 General Inquirer, 77 categories',
    summary:
      'First principal component of the 77 category counts, loading on Negative, Weak, Fail and Fall.',
    baseCoverage: 98,
    availableFrom: '1984-01-02',
    feedStopsAt: AS_OF_DATE,
    updatedAt: '2026-07-31 18:00 UTC',
    cadence: 'daily',
    feedFailed: false,
    lastGoodAt: null,
    temporal: 'transient',
    method: 'none',
  },
  {
    id: 'tenk-tone',
    name: '10-K Tone (Fin-Neg/H4N)',
    category: 'tone',
    categoryLabel: 'Text tone',
    source: 'Annual 10-K filings · bag-of-words over a negative-tone dictionary',
    summary:
      'Share of negative-tone words in the filing, read against the abnormal return around the filing date.',
    baseCoverage: 74,
    availableFrom: '1994-01-01',
    feedStopsAt: AS_OF_DATE,
    updatedAt: '2026-07-30 21:00 UTC',
    cadence: 'quarterly',
    feedFailed: false,
    lastGoodAt: null,
    temporal: 'transient',
    method: 'tone',
  },
  {
    id: 'retail-attention',
    name: 'Retail Attention (ASVI)',
    category: 'attention',
    categoryLabel: 'Attention',
    source: 'Google search volume · log SVI less the log median of the previous eight weeks',
    summary:
      'Revealed attention of individual investors, a channel distinct from tone: its correlation with news sentiment is 1.4–2.3%.',
    baseCoverage: 91,
    availableFrom: '2004-01-04',
    feedStopsAt: '2026-07-29',
    updatedAt: '2026-07-29 18:00 UTC',
    cadence: 'weekly',
    feedFailed: true,
    lastGoodAt: '2026-07-29 18:00 UTC',
    temporal: 'transient',
    method: 'none',
  },
  {
    id: 'social-mood',
    name: 'Social Mood (GPOMS Calm)',
    category: 'mood',
    categoryLabel: 'Mood',
    source: 'Public micro-blog stream · GPOMS six-dimensional mood profile, Calm dimension',
    summary:
      'Locally standardised mood series. Only Calm leads the index; neither the bipolar indicator nor the other five dimensions do.',
    baseCoverage: 62,
    availableFrom: '2018-06-01',
    feedStopsAt: AS_OF_DATE,
    updatedAt: '2026-07-24 12:00 UTC',
    cadence: 'daily',
    feedFailed: false,
    lastGoodAt: null,
    temporal: 'lag',
    method: 'none',
  },
  {
    id: 'news-analytics',
    name: 'News Analytics (NN)',
    category: 'news',
    categoryLabel: 'News',
    source: '900,754 news articles · three-layer neural sentiment engine, 3,000 annotated training items',
    summary:
      'Per-article probabilities of positive, negative and neutral tone, aggregated to the cadence chosen below.',
    baseCoverage: 95,
    availableFrom: '2003-01-01',
    feedStopsAt: AS_OF_DATE,
    updatedAt: '2026-07-31 18:00 UTC',
    cadence: 'daily',
    feedFailed: false,
    lastGoodAt: null,
    temporal: 'mixed',
    method: 'aggregation',
  },
  {
    id: 'aggregate-sentiment',
    name: 'Aggregate Sentiment',
    category: 'regime',
    categoryLabel: 'Regime',
    source: 'First principal component of CEFD, TURN, NIPO, RIPO, S and PDND',
    summary:
      'A market-wide sentiment level rather than a shock — the conditioning variable the cross-sectional evidence is read against.',
    baseCoverage: 100,
    availableFrom: '1965-07-01',
    feedStopsAt: AS_OF_DATE,
    updatedAt: '2026-07-31 18:00 UTC',
    cadence: 'monthly',
    feedFailed: false,
    lastGoodAt: null,
    temporal: 'regime',
    method: 'none',
  },
];

/** The wireframe's opening state: three cards ticked, a fourth driving the detail. */
const DEFAULT_INCLUDED: readonly AltSignalId[] = [
  'media-pessimism',
  'retail-attention',
  'news-analytics',
];

const DEFAULT_DETAIL_SIGNAL: AltSignalId = 'tenk-tone';

// ---------------------------------------------------------------------------
// Detail evidence
// ---------------------------------------------------------------------------

const MEDIA_PESSIMISM_RESPONSE: readonly ResponsePoint[] = [
  { label: 'Day +1', value: -8.1 },
  { label: 'Days 2–5', value: 6.8 },
  { label: 'Cumulative', value: -1.3 },
];

const MEDIA_PESSIMISM_FLAGS: readonly string[] = [
  'Unusually high or low readings precede heavy trading volume — the follow-through is in turnover, not only in price.',
  'Predicts a negative SMB return: the pressure concentrates on the small caps individual investors hold.',
  'A trading rule on the signal grosses roughly 7% a year, which transaction costs erode.',
];

const ASVI_RESPONSE: readonly ResponsePoint[] = [
  { label: 'Week 1', value: 18.7 },
  { label: 'Week 2', value: 14.9 },
  { label: 'Weeks 1–2 cumulative', value: 33.6 },
];

const ASVI_FLAGS: readonly string[] = [
  'Reverses within the year — the temporary overvaluation is reabsorbed.',
  'Strongest among small caps and among the stocks individual investors trade most.',
  'IPOs with high pre-issue attention: 16.98% first-day return against 10.90%, then long-run underperformance.',
];

/**
 * The four dictionary-weighting combinations.
 *
 * Fin-Neg with tf.idf carries `null`: the evidence reports no estimate for that
 * pairing, which is a different statement from an estimate of zero and is drawn
 * as a hatched bar rather than a bar of no length.
 */
const TONE_COMBINATIONS: readonly ToneCombination[] = [
  {
    dictionary: 'fin-neg',
    weighting: 'proportional',
    tStat: -2.64,
    significant: true,
    verdict: 'significant',
  },
  { dictionary: 'h4n', weighting: 'tfidf', tStat: -1.98, significant: true, verdict: 'significant' },
  {
    dictionary: 'h4n',
    weighting: 'proportional',
    tStat: -0.71,
    significant: false,
    verdict: 'not distinct from zero',
  },
  {
    dictionary: 'fin-neg',
    weighting: 'tfidf',
    tStat: null,
    significant: false,
    verdict: TONE_NOT_REPORTED,
  },
];

/** Two-sided 5% critical value of the t-distribution in a large sample. */
const TONE_CRITICAL_VALUE = -1.96;

const TONE_FLAGS: readonly string[] = [
  'Weighting is not neutral: Fin-Neg is significant already under proportional weighting, H4N only under tf.idf.',
  H4N_MISCLASSIFICATION_NOTE,
  'Estimated net of size, book-to-market, momentum and the other standard controls.',
];

const LAG_CAUSALITY_ROWS = [
  { lag: 1, pValue: 0.085, significant: false },
  { lag: 2, pValue: 0.011, significant: true },
  { lag: 3, pValue: 0.024, significant: true },
  { lag: 4, pValue: 0.032, significant: true },
  { lag: 5, pValue: 0.048, significant: true },
  { lag: 6, pValue: 0.013, significant: true },
  { lag: 7, pValue: 0.281, significant: false },
] as const;

const MOOD_FLAGS: readonly string[] = [
  'Feeding Calm into a self-organising fuzzy neural network lifts directional accuracy to about 87.6%.',
  'Neither the bipolar positive/negative indicator nor the other five GPOMS dimensions carry predictive power.',
  'What is measured is part of the signal: the choice of dimension is not a detail of the method.',
];

const NEWS_DAILY_POINTS: readonly ResponsePoint[] = [
  { label: 'Day 1', value: 0.17 },
  { label: 'Day 2', value: 0.04 },
];

/**
 * Weekly decile spread by lag.
 *
 * Week 1 is the announcement week at 3.75%; the decay to week 13 is the shape
 * of a quarter-long reaction, and week 13 is where the evidence stops.
 */
const NEWS_WEEKLY_POINTS: readonly ResponsePoint[] = [
  { label: 'Week 1', value: 3.75 },
  { label: 'Week 2', value: 2.42 },
  { label: 'Week 3', value: 1.86 },
  { label: 'Week 4', value: 1.54 },
  { label: 'Week 5', value: 1.31 },
  { label: 'Week 6', value: 1.12 },
  { label: 'Week 7', value: 0.96 },
  { label: 'Week 8', value: 0.83 },
  { label: 'Week 9', value: 0.71 },
  { label: 'Week 10', value: 0.62 },
  { label: 'Week 11', value: 0.53 },
  { label: 'Week 12', value: 0.44 },
  { label: 'Week 13', value: 0.31 },
];

const NEWS_FLAGS: readonly string[] = [
  'Neutral news outperforms no news at all — the fact of publication carries information of its own.',
  'Positive tone is in the price within a week; negative tone predicts low returns for the whole quarter.',
  'Much of the delayed reaction lands on the next earnings announcement: a 5.57% announcement-week spread, t = 2.7.',
];

const SENTIMENT_LOADINGS: readonly SentimentLoading[] = [
  { name: 'CEFD', value: -0.241, lagged: false },
  { name: 'TURN', value: 0.242, lagged: true },
  { name: 'NIPO', value: 0.253, lagged: false },
  { name: 'RIPO', value: 0.257, lagged: true },
  { name: 'S', value: 0.112, lagged: false },
  { name: 'PDND', value: -0.283, lagged: true },
];

const AGGREGATE_FLAGS: readonly string[] = [
  'A stock’s sentiment beta rises with how speculative it is; the most speculative names earn the least after a high reading.',
  'Predictive coefficient on SMB of about −0.40 per point of index.',
  'Returns around earnings announcements tend to be lower after periods of high sentiment.',
];

// ---------------------------------------------------------------------------
// The conditional cross-section
// ---------------------------------------------------------------------------

/**
 * One characteristic's conditional cross-section, as four endpoints and two
 * bows rather than twenty hand-typed decile returns.
 *
 * The bow is what makes a row U-shaped: it is added to the chord between D1 and
 * D10 with a weight that is one at the middle decile and zero at both ends, so
 * a positive bow pulls the middle towards zero while leaving the extremes
 * exactly where the endpoints put them. Growth and distress are the two the
 * evidence describes that way — it is the extreme deciles that react to
 * sentiment, not the intermediate ones.
 */
interface CharacteristicSeed {
  readonly highD1: number;
  readonly highD10: number;
  readonly highBow: number;
  readonly lowD1: number;
  readonly lowD10: number;
  readonly lowBow: number;
  readonly shape: DecileShape;
  readonly note: string;
}

const CHARACTERISTIC_SEEDS: Record<FirmCharacteristic, CharacteristicSeed> = {
  size: {
    highD1: -0.31,
    highD10: -0.44,
    highBow: 0,
    lowD1: 0.42,
    lowD10: 0.18,
    lowBow: 0,
    shape: 'monotone',
    // No figures in here. The two spreads are stated above the chart, computed
    // off the rows the chart draws, and they move with the index basis — a
    // number typed into this sentence would keep saying 0.24 while the chart
    // read 0.21 under SENT.
    note: 'The size effect is a low-sentiment phenomenon: the small-cap decile beats the large-cap one by a wider margin when sentiment is low than when it is high.',
  },
  age: {
    highD1: -0.46,
    highD10: -0.11,
    highBow: 0,
    lowD1: 0.41,
    lowD10: 0.14,
    lowBow: 0,
    shape: 'monotone',
    note: 'Young firms are the hardest to value and the first to be bid up: after a high reading they earn the least, and the ordering inverts when sentiment is low.',
  },
  volatility: {
    highD1: -0.09,
    highD10: -0.71,
    highBow: 0,
    lowD1: 0.14,
    lowD10: 0.52,
    lowBow: 0,
    shape: 'monotone',
    note: 'Volatility is the cleanest speculativeness proxy on the list: the most volatile decile carries the largest conditional swing between the two regimes.',
  },
  profitability: {
    highD1: -0.58,
    highD10: -0.07,
    highBow: 0,
    lowD1: 0.46,
    lowD10: 0.13,
    lowBow: 0,
    shape: 'monotone',
    note: 'Unprofitable firms have no earnings to anchor a valuation, so they move with sentiment and give it back afterwards.',
  },
  'dividend-policy': {
    highD1: -0.51,
    highD10: -0.06,
    highBow: 0,
    lowD1: 0.39,
    lowD10: 0.11,
    lowBow: 0,
    shape: 'monotone',
    note: 'Non-payers behave as the speculative end: paying a dividend is itself a piece of hard information about the cash flows.',
  },
  growth: {
    highD1: -0.34,
    highD10: -0.42,
    highBow: 0.31,
    lowD1: 0.35,
    lowD10: 0.31,
    lowBow: -0.28,
    shape: 'u-shaped',
    note: 'U-shaped: both extremes of growth are hard to value, and it is those deciles that react. The intermediate ones barely move with sentiment at all.',
  },
  distress: {
    highD1: -0.29,
    highD10: -0.57,
    highBow: 0.28,
    lowD1: 0.28,
    lowD10: 0.49,
    lowBow: -0.27,
    shape: 'u-shaped',
    note: 'U-shaped: the soundest and the most distressed deciles both respond to sentiment, and the middle of the distribution does not.',
  },
};

// ---------------------------------------------------------------------------
// ML aggregation
// ---------------------------------------------------------------------------

const ML_MODELS: readonly MlModelRow[] = [
  {
    id: 'ols',
    name: 'OLS, 920 signals',
    r2Oos: -3.46,
    ic: null,
    weight: 0,
    note: 'over-parameterised',
  },
  {
    id: 'elastic-net',
    name: 'Elastic net',
    r2Oos: 0.11,
    ic: 0.021,
    weight: 8,
    note: 'selection and shrinkage',
  },
  { id: 'pcr', name: 'PCR', r2Oos: 0.26, ic: 0.031, weight: 12, note: '' },
  { id: 'pls', name: 'PLS', r2Oos: 0.27, ic: 0.033, weight: 13, note: '' },
  { id: 'random-forest', name: 'Random forest', r2Oos: 0.33, ic: 0.049, weight: 19, note: '' },
  { id: 'boosted-trees', name: 'Boosted trees', r2Oos: 0.34, ic: 0.051, weight: 20, note: '' },
  { id: 'nn3', name: 'NN3', r2Oos: 0.4, ic: 0.058, weight: 28, note: 'best out of sample' },
];

const AGGREGATE_LABEL = 'NN3 aggregate';
const BEST_COMPONENT_LABEL = 'Best component — 3-characteristic linear';

/** Annualised Sharpe of the long-short decile spread, by weighting. */
const AGGREGATE_SHARPE: Record<ScoreWeighting, number> = {
  'value-weighted': 1.35,
  'equal-weighted': 2.45,
};

const COMPONENT_SHARPE: Record<ScoreWeighting, number> = {
  'value-weighted': 0.61,
  'equal-weighted': 0.83,
};

const AGGREGATE_R2 = 0.4;
const COMPONENT_R2 = 0.13;
const BUY_AND_HOLD_SHARPE = 0.51;
const MARKET_TIMING_SHARPE = 0.77;

// ---------------------------------------------------------------------------
// The service
// ---------------------------------------------------------------------------

/**
 * State behind `docs/21 Alternative Data & Sentiment.md`.
 *
 * The one structural decision worth stating up front: **there is no `selected`
 * signal here.** There are two independent pieces of state that a single field
 * would have merged — `_detailSignalId`, the one card whose evidence the detail
 * panel is showing, and `_includedIds`, the set handed to Views Builder — and
 * no writer of either touches the other. That separation is the page's central
 * interaction and it is enforced by there being nowhere to conflate them.
 *
 * Everything the cards print is derived rather than stored: coverage is the
 * signal's reach scaled by the universe, partial coverage is the answer to
 * "does this feed span the window on screen", and feed health is the answer to
 * "has it updated within its own cadence". A failed feed is modelled as a feed
 * that stops early, which is why it makes a signal partial instead of removing
 * it.
 */
@Injectable({ providedIn: 'root' })
export class AltDataSentimentService {
  // --- scope ----------------------------------------------------------------

  readonly universes = UNIVERSES;

  private readonly _universeId = signal<string>(UNIVERSES[0].id);
  readonly universeId = this._universeId.asReadonly();

  readonly universe = computed<UniverseOption>(
    () => UNIVERSES.find((option) => option.id === this._universeId()) ?? UNIVERSES[0],
  );

  private readonly _coverageStart = signal(COVERAGE_START_DEFAULT);
  readonly coverageStart = this._coverageStart.asReadonly();

  private readonly _coverageEnd = signal(COVERAGE_END_DEFAULT);
  readonly coverageEnd = this._coverageEnd.asReadonly();

  /**
   * Why the window on screen was refused, or null.
   *
   * A rejected range never reaches the signals: the previous window stays in
   * force and the message says what has to change. Silently clamping the date
   * would leave the field showing one window and the cards computed on another.
   */
  private readonly _coverageError = signal<string | null>(null);
  readonly coverageError = this._coverageError.asReadonly();

  readonly feedsUpdatedAt = signal(AS_OF_LABEL).asReadonly();

  // --- tabs -----------------------------------------------------------------

  private readonly _tab = signal<AltDataTab>('signal-library');
  readonly tab = this._tab.asReadonly();

  private readonly _panelLoading = signal(false);
  readonly panelLoading = this._panelLoading.asReadonly();

  // --- filters --------------------------------------------------------------

  private readonly _query = signal('');
  readonly query = this._query.asReadonly();

  private readonly _activeCategories = signal<readonly SignalCategory[]>([...SIGNAL_CATEGORIES]);
  readonly activeCategories = this._activeCategories.asReadonly();

  // --- selection, which is two things ---------------------------------------

  private readonly _detailSignalId = signal<AltSignalId | null>(DEFAULT_DETAIL_SIGNAL);
  readonly detailSignalId = this._detailSignalId.asReadonly();

  private readonly _includedIds = signal<readonly AltSignalId[]>([...DEFAULT_INCLUDED]);
  readonly includedIds = this._includedIds.asReadonly();

  // --- per-signal method controls -------------------------------------------

  private readonly _toneDictionary = signal<ToneDictionary>('fin-neg');
  readonly toneDictionary = this._toneDictionary.asReadonly();

  private readonly _toneWeighting = signal<ToneWeighting>('proportional');
  readonly toneWeighting = this._toneWeighting.asReadonly();

  private readonly _newsAggregation = signal<NewsAggregation>('daily');
  readonly newsAggregation = this._newsAggregation.asReadonly();

  // --- cross-sectional parameters -------------------------------------------

  private readonly _regime = signal<SentimentRegime>('high');
  readonly regime = this._regime.asReadonly();

  private readonly _basis = signal<SentimentBasis>('sent-perp');
  readonly basis = this._basis.asReadonly();

  private readonly _characteristic = signal<FirmCharacteristic>('size');
  readonly characteristic = this._characteristic.asReadonly();

  // --- ML parameters --------------------------------------------------------

  readonly mlModels = ML_MODELS;

  private readonly _selectedModelId = signal<MlModelRow['id'] | null>(null);
  readonly selectedModelId = this._selectedModelId.asReadonly();

  private readonly _scoreWeighting = signal<ScoreWeighting>('value-weighted');
  readonly scoreWeighting = this._scoreWeighting.asReadonly();

  // --- lifecycle ------------------------------------------------------------

  private readonly _loading = signal(false);
  readonly loading = this._loading.asReadonly();

  private readonly _errorMessage = signal<string | null>(null);
  readonly errorMessage = this._errorMessage.asReadonly();

  readonly errorDetail = computed<string | null>(() =>
    this._errorMessage() === null ? null : LOAD_FAILURE_DETAIL,
  );

  private pending: Promise<void> = Promise.resolve();

  /** Resolves once any read a setter started has finished. */
  settled(): Promise<void> {
    return this.pending;
  }

  // --- derived library ------------------------------------------------------

  /**
   * The signals available on the current universe and window.
   *
   * A signal drops out only when its feed and the window do not overlap at all.
   * Everything else — a feed that starts late, a feed that stopped two days ago
   * — is partial coverage, which is a badge and not a removal.
   */
  readonly signals = computed<readonly AltSignal[]>(() => {
    const universe = this.universe();
    if (!universe.altDataCoverage) return [];

    const start = this._coverageStart();
    const end = this._coverageEnd();

    return SIGNAL_SEEDS.filter(
      (seed) => seed.availableFrom <= end && seed.feedStopsAt >= start,
    ).map((seed) => this.resolve(seed, universe, start, end));
  });

  readonly totalCount = computed(() => this.signals().length);

  readonly visibleSignals = computed<readonly AltSignal[]>(() => {
    const query = this._query().trim().toLowerCase();
    const categories = this._activeCategories();
    return this.signals().filter(
      (item) =>
        categories.includes(item.category) &&
        (query === '' || item.name.toLowerCase().includes(query)),
    );
  });

  readonly visibleCount = computed(() => this.visibleSignals().length);

  /** The chip combination that matches nothing because nothing here is an aggregate. */
  readonly onlyMlCategory = computed(
    () => this._activeCategories().length === 1 && this._activeCategories()[0] === 'ml',
  );

  readonly staleFeedCount = computed(
    () => this.signals().filter((item) => item.feed === 'stale').length,
  );

  readonly failedFeedCount = computed(
    () => this.signals().filter((item) => item.feed === 'failed').length,
  );

  readonly partialCoverageCount = computed(
    () => this.signals().filter((item) => item.partialCoverage).length,
  );

  /** One signal by id, resolved against the current scope. */
  signalById(id: AltSignalId): AltSignal | null {
    return this.signals().find((item) => item.id === id) ?? null;
  }

  isIncluded(id: AltSignalId): boolean {
    return this._includedIds().includes(id);
  }

  /** The included signals that still exist on this universe and window. */
  readonly includedSignals = computed<readonly AltSignal[]>(() =>
    this.signals().filter((item) => this._includedIds().includes(item.id)),
  );

  /**
   * How many signals the footer would actually hand over.
   *
   * Counted off `includedSignals`, never off `_includedIds`. A universe or a
   * window can put a signal out of reach while its id is still ticked — the id
   * is kept on purpose, so coming back restores the tick — and a count taken
   * from the id list would say "3 of 0 signals selected", enable the primary
   * action and then navigate with an empty candidate list. The number on screen
   * and the payload that travels are the same list or they are a bug.
   */
  readonly includedCount = computed(() => this.includedSignals().length);

  readonly state = computed<PageState>(() => {
    if (this._loading()) return 'loading';
    if (this._errorMessage() !== null) return 'error';
    if (this.signals().length === 0) return 'empty';
    return 'ready';
  });

  /** True when the universe itself is out of reach, as against the window. */
  readonly universeHasNoCoverage = computed(() => !this.universe().altDataCoverage);

  // --- the detail panel -----------------------------------------------------

  /**
   * What the detail panel shows for the card currently driving it.
   *
   * The classification here is the verdict under the method chosen on the card,
   * which is not always the library's own: News Analytics is filed as Mixed and
   * resolves to Transient under daily aggregation and Persistent under weekly.
   */
  readonly detail = computed<SignalDetailView | null>(() => {
    const id = this._detailSignalId();
    if (id === null) return null;
    const item = this.signalById(id);
    if (item === null) return null;

    const figure = this.figureFor(item);
    return {
      signal: item,
      eyebrow: `${item.categoryLabel} · cov. ${item.coverage}% · updated ${item.updatedAt.slice(0, 10)}`,
      methodLabel: this.methodLabel(item),
      temporal: this.temporalFor(item),
      verdict: this.verdictFor(item),
      figureTitle: this.figureTitle(item),
      figureSubtitle: this.figureSubtitle(item),
      secondaryFlags: this.flagsFor(item),
      figure,
      crossSectionalLink: item.id === 'aggregate-sentiment',
    };
  });

  // --- cross-sectional ------------------------------------------------------

  readonly crossSection = computed<CrossSectionResult>(() => {
    const characteristic = this._characteristic();
    const seed = CHARACTERISTIC_SEEDS[characteristic];
    const basis = this._basis();
    const scale = basis === 'sent' ? SENT_ATTENUATION : 1;

    const rows: DecileRow[] = [];
    for (let decile = 1; decile <= 10; decile++) {
      rows.push({
        decile,
        high: round2(decileValue(seed.highD1, seed.highD10, seed.highBow, decile) * scale),
        low: round2(decileValue(seed.lowD1, seed.lowD10, seed.lowBow, decile) * scale),
      });
    }

    return {
      characteristic,
      basis,
      regime: this._regime(),
      rows,
      spreadHigh: round2(rows[9].high - rows[0].high),
      spreadLow: round2(rows[9].low - rows[0].low),
      shape: seed.shape,
      note: seed.note,
    };
  });

  readonly varianceExplained = computed(() => SENTIMENT_BASIS_VARIANCE[this._basis()]);

  // --- ML aggregation -------------------------------------------------------

  readonly aggregate = computed<AggregateComparison>(() => {
    const weighting = this._scoreWeighting();
    return {
      weighting,
      aggregate: {
        label: AGGREGATE_LABEL,
        r2Oos: AGGREGATE_R2,
        sharpe: AGGREGATE_SHARPE[weighting],
      },
      bestComponent: {
        label: BEST_COMPONENT_LABEL,
        r2Oos: COMPONENT_R2,
        sharpe: COMPONENT_SHARPE[weighting],
      },
      buyAndHoldSharpe: BUY_AND_HOLD_SHARPE,
      marketTimingSharpe: MARKET_TIMING_SHARPE,
    };
  });

  readonly selectedModel = computed<MlModelRow | null>(
    () => ML_MODELS.find((model) => model.id === this._selectedModelId()) ?? null,
  );

  // --- writers --------------------------------------------------------------

  /** A different universe is a different set of coverage figures: a whole read. */
  setUniverse(id: string): void {
    if (id === this._universeId()) return;
    this._universeId.set(id);
    this.queueRefresh();
  }

  setCoverageStart(value: string): void {
    if (!this.acceptWindow(value, this._coverageEnd())) return;
    this._coverageStart.set(value);
    this.queueRefresh();
  }

  setCoverageEnd(value: string): void {
    if (!this.acceptWindow(this._coverageStart(), value)) return;
    this._coverageEnd.set(value);
    this.queueRefresh();
  }

  /** A tab swap re-reads the panel it opens, not the page. */
  setTab(tab: AltDataTab): void {
    if (tab === this._tab()) return;
    this._tab.set(tab);
    this.pending = this.loadPanel();
  }

  setQuery(value: string): void {
    this._query.set(value);
  }

  /**
   * Turns a category chip on or off.
   *
   * The last active chip refuses to switch off: an empty category set is a
   * filter with no way back except the search field, and the spec requires at
   * least one category to stay selected.
   */
  toggleCategory(category: SignalCategory): void {
    const active = this._activeCategories();
    if (active.includes(category)) {
      if (active.length === 1) return;
      this._activeCategories.set(active.filter((item) => item !== category));
      return;
    }
    this._activeCategories.set(
      SIGNAL_CATEGORIES.filter((item) => item === category || active.includes(item)),
    );
  }

  isCategoryActive(category: SignalCategory): boolean {
    return this._activeCategories().includes(category);
  }

  /** True while the chip is the only one left, and so cannot be switched off. */
  isLastCategory(category: SignalCategory): boolean {
    const active = this._activeCategories();
    return active.length === 1 && active[0] === category;
  }

  /** The way back from "no signal matches", offered by the empty state itself. */
  resetFilters(): void {
    this._query.set('');
    this._activeCategories.set([...SIGNAL_CATEGORIES]);
  }

  /** Widens the window to everything any feed holds — the empty state's action. */
  widenCoverageWindow(): void {
    this._coverageError.set(null);
    this._coverageStart.set(COVERAGE_MIN_DATE);
    this._coverageEnd.set(AS_OF_DATE);
    this.queueRefresh();
  }

  /** Makes a card drive the detail panel. Touches no inclusion. */
  selectForDetail(id: AltSignalId): void {
    this._detailSignalId.set(id);
  }

  /** Includes or excludes a card. Touches nothing about the detail panel. */
  toggleInclude(id: AltSignalId): void {
    const included = this._includedIds();
    this._includedIds.set(
      included.includes(id) ? included.filter((item) => item !== id) : [...included, id],
    );
  }

  setToneDictionary(dictionary: ToneDictionary): void {
    this._toneDictionary.set(dictionary);
  }

  setToneWeighting(weighting: ToneWeighting): void {
    this._toneWeighting.set(weighting);
  }

  setNewsAggregation(aggregation: NewsAggregation): void {
    this._newsAggregation.set(aggregation);
  }

  setSentimentRegime(regime: SentimentRegime): void {
    this._regime.set(regime);
  }

  setSentimentBasis(basis: SentimentBasis): void {
    this._basis.set(basis);
  }

  setCharacteristic(characteristic: FirmCharacteristic): void {
    this._characteristic.set(characteristic);
  }

  setScoreWeighting(weighting: ScoreWeighting): void {
    this._scoreWeighting.set(weighting);
  }

  selectModel(id: MlModelRow['id']): void {
    this._selectedModelId.set(id);
  }

  clearError(): void {
    this._errorMessage.set(null);
  }

  /**
   * Re-reads coverage and freshness for the current universe and window.
   *
   * A failure empties nothing: the page raises the error in place of the grid
   * and the scope bar stays where it is, because the parameters are still what
   * the reader chose and the recovery is to try them again.
   */
  async refresh(fail = false): Promise<void> {
    if (this._loading()) return;

    this._loading.set(true);
    this._errorMessage.set(null);

    await delay(LATENCY_MS);

    if (fail) {
      this._errorMessage.set(LOAD_FAILURE_MESSAGE);
      this._loading.set(false);
      return;
    }

    this._loading.set(false);
  }

  // --- internals ------------------------------------------------------------

  private queueRefresh(): void {
    if (this._loading()) return;
    this.pending = this.refresh();
  }

  private async loadPanel(): Promise<void> {
    this._panelLoading.set(true);
    await delay(PANEL_LATENCY_MS);
    this._panelLoading.set(false);
  }

  /** True when the window is usable; sets the message and refuses when not. */
  private acceptWindow(start: string, end: string): boolean {
    if (end < start) {
      this._coverageError.set(COVERAGE_RANGE_INVALID);
      return false;
    }
    if (end > AS_OF_DATE) {
      this._coverageError.set(COVERAGE_END_IN_FUTURE);
      return false;
    }
    this._coverageError.set(null);
    return true;
  }

  /** One seed, resolved against the universe and the window on screen. */
  private resolve(
    seed: SignalSeed,
    universe: UniverseOption,
    start: string,
    end: string,
  ): AltSignal {
    const coverage = Math.min(100, Math.round(seed.baseCoverage * universe.coverageFactor));
    const from = seed.availableFrom > start ? seed.availableFrom : start;
    const to = seed.feedStopsAt < end ? seed.feedStopsAt : end;
    const partial = seed.availableFrom > start || seed.feedStopsAt < end;

    return {
      id: seed.id,
      name: seed.name,
      category: seed.category,
      categoryLabel: seed.categoryLabel,
      source: seed.source,
      summary: seed.summary,
      coverage,
      partialCoverage: partial,
      coverageNote: partial ? `Covers ${from} to ${to} of the selected window.` : null,
      updatedAt: seed.updatedAt,
      cadence: seed.cadence,
      feed: feedHealth(seed),
      lastGoodAt: seed.lastGoodAt,
      temporal: seed.temporal,
      method: seed.method,
    };
  }

  private figureFor(item: AltSignal): SignalFigure {
    switch (item.id) {
      case 'media-pessimism':
        return {
          kind: 'shock-response',
          points: MEDIA_PESSIMISM_RESPONSE,
          unit: 'bp',
          axisName: 'Index return, basis points',
        };
      case 'retail-attention':
        return {
          kind: 'shock-response',
          points: ASVI_RESPONSE,
          unit: 'bp',
          axisName: 'Aggregate return, basis points',
        };
      case 'tenk-tone':
        return {
          kind: 'tone-methods',
          combinations: TONE_COMBINATIONS,
          active: this.activeCombination(),
          criticalValue: TONE_CRITICAL_VALUE,
        };
      case 'social-mood':
        return {
          kind: 'lag-causality',
          rows: LAG_CAUSALITY_ROWS,
          threshold: 0.05,
          dimension: 'Calm',
        };
      case 'news-analytics': {
        const weekly = this._newsAggregation() === 'weekly';
        return {
          kind: 'news-cadence',
          aggregation: this._newsAggregation(),
          points: weekly ? NEWS_WEEKLY_POINTS : NEWS_DAILY_POINTS,
          unit: '%',
          axisName: weekly ? 'Decile spread, per cent' : 'Post-publication return, per cent',
          horizonLabel: weekly ? '13 weeks — a full quarter' : 'one to two days',
          alternativeLabel: weekly
            ? 'Aggregated daily, the same articles predict for one to two days only.'
            : 'Aggregated weekly, the same articles predict for 13 weeks.',
        };
      }
      default:
        return {
          kind: 'loadings',
          basis: this._basis(),
          loadings: SENTIMENT_LOADINGS,
          varianceExplained: SENTIMENT_BASIS_VARIANCE[this._basis()],
        };
    }
  }

  /** The dictionary-weighting pairing currently chosen on the 10-K card. */
  private activeCombination(): ToneCombination {
    const dictionary = this._toneDictionary();
    const weighting = this._toneWeighting();
    return (
      TONE_COMBINATIONS.find(
        (combination) =>
          combination.dictionary === dictionary && combination.weighting === weighting,
      ) ?? TONE_COMBINATIONS[0]
    );
  }

  private methodLabel(item: AltSignal): string | null {
    if (item.method === 'tone') {
      return `${TONE_DICTIONARY_SHORT[this._toneDictionary()]} · ${TONE_WEIGHTING_LABEL[
        this._toneWeighting()
      ].toLowerCase()}`;
    }
    if (item.method === 'aggregation') {
      return `${this._newsAggregation() === 'weekly' ? 'Weekly' : 'Daily'} aggregation`;
    }
    return null;
  }

  /**
   * The classification under the method currently chosen.
   *
   * Only News Analytics resolves: its library entry is Mixed precisely because
   * the answer depends on the cadence, and the toggle is what settles it.
   */
  private temporalFor(item: AltSignal): AltSignal['temporal'] {
    if (item.id !== 'news-analytics') return item.temporal;
    return this._newsAggregation() === 'weekly' ? 'persistent' : 'transient';
  }

  private verdictFor(item: AltSignal): string {
    switch (item.id) {
      case 'media-pessimism':
        return 'The day-ahead pressure is given back over days 2 to 5 and the cumulative effect is not distinct from zero — the signature sentiment theory predicts.';
      case 'retail-attention':
        return 'Attention buys the stock for two weeks and the overvaluation is reabsorbed within the year — pressure, not news.';
      case 'tenk-tone': {
        const active = this.activeCombination();
        if (active.tStat === null) {
          return 'This dictionary-weighting pairing is not reported by the evidence, so nothing can be said about it — which is not the same as saying the effect is zero.';
        }
        const t = tLabel(active.tStat);
        return active.significant
          ? `Negative tone predicts a negative abnormal return around the filing date, t = ${t}. The cumulative effect reverts inside the quarter.`
          : `Under this pairing the estimate is not distinct from zero, t = ${t} — the dictionary misfires on financial text before the weighting can rescue it.`;
      }
      case 'social-mood':
        return 'Calm Granger-causes the index at lags of two to six days at better than 5%; no reversal test is involved, so the classification is a lead time rather than a pole of the criterion.';
      case 'news-analytics':
        return this._newsAggregation() === 'weekly'
          ? 'Aggregated weekly, predictability runs 13 weeks — a quarter is too long for price pressure, so the engine is extracting information not yet in prices.'
          : 'Aggregated daily, predictability lasts one to two days and then stops — on this cadence the same articles read as transitory pressure.';
      default:
        return 'A slow-moving level rather than a shock: high readings precede low returns on the speculative end of the cross-section, which is where the next tab reads it.';
    }
  }

  private flagsFor(item: AltSignal): readonly string[] {
    switch (item.id) {
      case 'media-pessimism':
        return MEDIA_PESSIMISM_FLAGS;
      case 'retail-attention':
        return ASVI_FLAGS;
      case 'tenk-tone':
        return TONE_FLAGS;
      case 'social-mood':
        return MOOD_FLAGS;
      case 'news-analytics':
        return NEWS_FLAGS;
      default:
        return AGGREGATE_FLAGS;
    }
  }

  private figureTitle(item: AltSignal): string {
    switch (item.id) {
      case 'media-pessimism':
        return 'Response of the index to a one-standard-deviation rise in pessimism';
      case 'retail-attention':
        return 'Aggregate return after a one-standard-deviation rise in ASVI';
      case 'tenk-tone':
        return 'Abnormal return around the filing date, by dictionary and weighting';
      case 'social-mood':
        return 'Granger causality of the Calm dimension, by lag';
      case 'news-analytics':
        return this._newsAggregation() === 'weekly'
          ? 'Long-short decile spread by week after publication'
          : 'Return after publication, by day';
      default:
        return 'Loadings of the six proxies on the first principal component';
    }
  }

  private figureSubtitle(item: AltSignal): string {
    const temporal = TEMPORAL_LABEL[this.temporalFor(item)];
    if (item.id === 'tenk-tone') {
      const active = this.activeCombination();
      const value = active.tStat === null ? TONE_NOT_REPORTED : `t = ${tLabel(active.tStat)}`;
      return `${TONE_DICTIONARY_SHORT[active.dictionary]} · ${TONE_WEIGHTING_LABEL[active.weighting].toLowerCase()} · ${value} · ${temporal}`;
    }
    if (item.id === 'news-analytics') {
      return `${this._newsAggregation() === 'weekly' ? 'Weekly' : 'Daily'} aggregation · ${temporal}`;
    }
    return `${item.categoryLabel} · ${temporal}`;
  }
}

// ---------------------------------------------------------------------------
// Pure helpers
// ---------------------------------------------------------------------------

/**
 * A decile's conditional return.
 *
 * The chord between D1 and D10 plus a bow that is one at the middle decile and
 * zero at both ends. With `bow = 0` the row is the straight line a monotone
 * characteristic gives; with a bow of the opposite sign to the endpoints the
 * middle deciles are pulled towards zero, which is the U-shape the evidence
 * describes for growth and distress.
 */
function decileValue(d1: number, d10: number, bow: number, decile: number): number {
  const t = (decile - 1) / 9;
  const chord = d1 + (d10 - d1) * t;
  const centre = (decile - 5.5) / 4.5;
  return chord + bow * (1 - centre * centre);
}

/**
 * A t-statistic with a real minus sign.
 *
 * `toFixed` emits a hyphen-minus, which is narrower than a digit and is read as
 * "dash" rather than "minus". The page spells every negative number with U+2212
 * and these strings are printed beside figures that do.
 */
function tLabel(value: number): string {
  const text = value.toFixed(2);
  return text.startsWith('-') ? `\u2212${text.slice(1)}` : text;
}

function round2(value: number): number {
  return Math.round(value * 100) / 100;
}

/**
 * What a feed is doing, from its own cadence rather than a stored label.
 *
 * A failed feed is failed however recently it ran; otherwise the question is
 * whether it has updated within its cadence, with a tolerance so a feed one
 * day late on a daily series is not called stale.
 */
function feedHealth(seed: SignalSeed): FeedHealth {
  if (seed.feedFailed) return 'failed';
  const age = daysBetween(seed.updatedAt.slice(0, 10), AS_OF_DATE);
  return age > FEED_CADENCE_DAYS[seed.cadence] * STALENESS_TOLERANCE ? 'stale' : 'live';
}

/** Whole days between two `YYYY-MM-DD` dates. */
function daysBetween(from: string, to: string): number {
  const ms = Date.parse(`${to}T00:00:00Z`) - Date.parse(`${from}T00:00:00Z`);
  return Math.round(ms / 86_400_000);
}

function delay(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
