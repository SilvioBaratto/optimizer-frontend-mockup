/**
 * TypeScript mirror of the `alt_data_sentiment` domain type — the library of
 * alternative-data and sentiment signals, their temporal classification, the
 * cross-sectional evidence and the machine-learning aggregation
 * (`docs/21 Alternative Data & Sentiment.md`).
 *
 * Mirrors the API contract — never a second source of truth. When the state
 * contract changes upstream, this follows; never the other way round.
 *
 * Four facts about the page are carried by the types rather than left to the
 * code that fills them in:
 *
 * 1. **Driving the detail and being included are two different things.** A
 *    signal is never "selected" without saying selected *for what*: the card
 *    that drives the detail panel is `detailSignalId` (one, `aria-selected`)
 *    and the cards handed to Views Builder are `includedIds` (many,
 *    `aria-checked`). There is no single `selected` field anywhere in this
 *    file, because a single field is exactly how the two would get conflated.
 * 2. **The temporal classification is a *result*, not a label.** It is the
 *    diagnostic criterion of the whole page — pressure that reverses is
 *    sentiment, impact that does not revert is information — so
 *    `SignalDetailView.temporal` is derived from the evidence under the method
 *    currently chosen, and may differ from the library's own
 *    `AltSignal.temporal`. News analytics is precisely that case: the library
 *    calls it Mixed, and the daily/weekly toggle resolves it to Transient or
 *    Persistent.
 * 3. **A failed feed is a state of the data, not of the card.** `FeedHealth`
 *    travels with `lastGoodAt` so the badge can carry the timestamp, and
 *    nothing in these types can remove a signal or make it unselectable
 *    because its feed failed — a failed feed narrows the window the signal
 *    covers, which surfaces as partial coverage.
 * 4. **Coverage is stated against the window on screen.** `coverage` is the
 *    cross-sectional share of the universe, `partialCoverage` is the answer to
 *    a different question — does the feed span the selected window — so a 98%
 *    signal that stops two days short is partial and a 62% one that spans the
 *    window whole is not.
 *
 * Units, once, so no field has to repeat them:
 * - shock responses are in basis points of index return;
 * - decile returns, out-of-sample `R²` and news predictability are in per cent
 *   per month unless the field says otherwise;
 * - `tStat` is a t-statistic and is negative when the tone predicts a negative
 *   abnormal return, which is the direction the evidence runs in.
 */

// --- the three analysis modes -------------------------------------------------

/**
 * Which of the three analyses is on screen.
 *
 * The tabs do not stack: Cross-Sectional Sentiment and ML Aggregation replace
 * the filter bar, the card grid and the detail panel outright, while the scope
 * bar, the tab bar and the selection footer stay where they are.
 */
export type AltDataTab = 'signal-library' | 'cross-sectional' | 'ml-aggregation';

export interface AltDataTabDefinition {
  readonly id: AltDataTab;
  readonly label: string;
  /** The `sr-only` heading of the tab panel. */
  readonly title: string;
  /** One line under the tab bar saying what this mode answers. */
  readonly definition: string;
}

export const ALT_DATA_TABS: readonly AltDataTabDefinition[] = [
  {
    id: 'signal-library',
    label: 'Signal Library',
    title: 'Signal library',
    definition:
      'One card per signal, with its coverage, its freshness and the temporal test that classifies it.',
  },
  {
    id: 'cross-sectional',
    label: 'Cross-Sectional Sentiment',
    title: 'Cross-sectional sentiment',
    definition:
      'Return spread by decile of a firm characteristic, conditioned on the sentiment regime.',
  },
  {
    id: 'ml-aggregation',
    label: 'ML Aggregation',
    title: 'ML aggregation',
    definition:
      'The candidate models that combine many noisy correlated signals into one risk-premium forecast.',
  },
];

// --- scope --------------------------------------------------------------------

/** One universe the alternative-data coverage is measured against. */
export interface UniverseOption {
  readonly id: string;
  readonly name: string;
  /** `'1,284 names · developed markets'`. */
  readonly detail: string;
  /**
   * Whether any alternative-data feed reaches this universe at all. False is
   * the page's empty state and is a fact about the universe, not a filter.
   */
  readonly altDataCoverage: boolean;
  /**
   * Scales every signal's cross-sectional coverage. A universe of large,
   * heavily covered names is reached by more feeds than a small-cap one; the
   * percentages on the cards are therefore a function of the universe and are
   * never carried as a constant per card.
   */
  readonly coverageFactor: number;
}

/** The end of the coverage window and the moment every freshness check is against. */
export const AS_OF_DATE = '2026-07-31';
export const AS_OF_LABEL = '2026-07-31 18:00 UTC';

/** Defaults of the coverage window, as the wireframe draws them. */
export const COVERAGE_START_DEFAULT = '2015-01-01';
export const COVERAGE_END_DEFAULT = AS_OF_DATE;
/** Nothing in the library reaches back further than this. */
export const COVERAGE_MIN_DATE = '1960-01-01';

export const COVERAGE_RANGE_INVALID =
  'The end of the window is before its start. Pick an end date on or after the start date.';

export const COVERAGE_END_IN_FUTURE = `The window cannot end after ${AS_OF_DATE}, the last date any feed has been updated to.`;

// --- categories ---------------------------------------------------------------

/** The filter-chip vocabulary. Every signal carries exactly one. */
export type SignalCategory = 'tone' | 'attention' | 'mood' | 'news' | 'ml' | 'regime';

export const SIGNAL_CATEGORIES: readonly SignalCategory[] = [
  'tone',
  'attention',
  'mood',
  'news',
  'ml',
  'regime',
];

export const SIGNAL_CATEGORY_LABEL: Record<SignalCategory, string> = {
  tone: 'Tone',
  attention: 'Attention',
  mood: 'Mood',
  news: 'News',
  ml: 'ML',
  regime: 'Regime',
};

/**
 * Why the ML chip can match nothing in the library.
 *
 * The aggregation is not a signal in the library: it is what the ML Aggregation
 * tab does *to* the signals. The chip stays in the bar — dropping a category
 * from a filter because it currently matches nothing hides the vocabulary — and
 * the grid says where the ML work actually lives.
 */
export const ML_CATEGORY_EMPTY_TITLE = 'No library signal is an ML aggregate';

export const ML_CATEGORY_EMPTY_DETAIL =
  'Machine learning combines the signals below rather than being one of them. Open the ML Aggregation tab for the candidate models, their out-of-sample R² and their weight in the aggregate score.';

// --- the temporal classification ----------------------------------------------

/**
 * The verdict of the diagnostic criterion.
 *
 * Sentiment theory predicts that a short-horizon move induced by a signal is
 * reversed; information theory predicts it persists. `transient` and
 * `persistent` are those two poles, `mixed` is a signal whose signature depends
 * on how it is aggregated, `regime` is a slow-moving conditioning level rather
 * than a shock, and `lag` is a signal that leads the index at a fixed distance.
 */
export type TemporalClass = 'transient' | 'persistent' | 'mixed' | 'regime' | 'lag';

export const TEMPORAL_CLASSES: readonly TemporalClass[] = [
  'transient',
  'persistent',
  'mixed',
  'regime',
  'lag',
];

export const TEMPORAL_LABEL: Record<TemporalClass, string> = {
  transient: 'Transient',
  persistent: 'Persistent',
  mixed: 'Mixed',
  regime: 'Regime',
  lag: 'Lag 2-6d',
};

/** Word and glyph together — a classification has to read in greyscale. */
export const TEMPORAL_ICON: Record<TemporalClass, string> = {
  transient: '↩',
  persistent: '→',
  mixed: '⇄',
  regime: '◐',
  lag: '⏲',
};

/** Structurally a `StatusTone`; a literal union so the model imports nothing. */
export type BadgeTone = 'neutral' | 'ok' | 'warn' | 'alert' | 'active' | 'pending';

export const TEMPORAL_TONE: Record<TemporalClass, BadgeTone> = {
  transient: 'warn',
  persistent: 'ok',
  mixed: 'active',
  regime: 'neutral',
  lag: 'pending',
};

export const TEMPORAL_DEFINITION: Record<TemporalClass, string> = {
  transient:
    'Pressure that reverses — the move is reabsorbed, so the signal carries sentiment rather than news.',
  persistent:
    'Impact that does not revert — the move stands, so the signal carries information not yet in prices.',
  mixed: 'Both signatures are present, and which one shows depends on the aggregation cadence.',
  regime: 'A slow-moving conditioning level rather than a shock, read against the cross-section.',
  lag: 'Leads the index at a fixed distance, established by a Granger-causality test rather than by a reversal.',
};

/** The two poles of the criterion, as the legend card states them. */
export const CRITERION_TRANSIENT =
  'Transient — pressure that reverses: −8.1 bp on day +1, +6.8 bp over days 2–5, net −1.3 bp.';

export const CRITERION_PERSISTENT =
  'Persistent — impact that does not revert: weekly news predictability runs 13 weeks.';

export const CRITERION_FOOTNOTE =
  'Every card below carries a StatusBadge set by this test — open a card to see the evidence behind its verdict.';

export const CRITERION_TITLE = 'Diagnostic criterion — sentiment against information';

// --- feed health --------------------------------------------------------------

export type FeedCadence = 'daily' | 'weekly' | 'monthly' | 'quarterly';

export const FEED_CADENCE_LABEL: Record<FeedCadence, string> = {
  daily: 'Daily',
  weekly: 'Weekly',
  monthly: 'Monthly',
  quarterly: 'Quarterly',
};

/** The expected distance between two observations, in days. */
export const FEED_CADENCE_DAYS: Record<FeedCadence, number> = {
  daily: 1,
  weekly: 7,
  monthly: 31,
  quarterly: 92,
};

/** How far past its cadence a feed may run before it is called stale. */
export const STALENESS_TOLERANCE = 1.5;

/**
 * What the feed behind a signal is doing.
 *
 * `failed` never removes the signal: the last good extract is still data, and
 * the card stays selectable with it. It shortens the window the feed covers,
 * which is what surfaces as partial coverage.
 */
export type FeedHealth = 'live' | 'stale' | 'failed';

export const FEED_HEALTH_LABEL: Record<FeedHealth, string> = {
  live: 'Feed live',
  stale: 'Feed stale',
  failed: 'Feed error',
};

export const FEED_HEALTH_ICON: Record<FeedHealth, string> = {
  live: '●',
  stale: '!',
  failed: '○',
};

export const FEED_HEALTH_TONE: Record<FeedHealth, BadgeTone> = {
  live: 'ok',
  stale: 'warn',
  failed: 'alert',
};

export const PARTIAL_COVERAGE_BADGE = 'partial coverage';

export const FAILED_FEED_NOTE =
  'The card stays selectable and the signal stays usable — what is shown is the last good extract, so the window it covers stops there.';

// --- per-signal method controls -----------------------------------------------

/** Which negative-tone dictionary the 10-K measure counts against. */
export type ToneDictionary = 'fin-neg' | 'h4n';

export const TONE_DICTIONARIES: readonly ToneDictionary[] = ['fin-neg', 'h4n'];

export const TONE_DICTIONARY_LABEL: Record<ToneDictionary, string> = {
  'fin-neg': 'Fin-Neg, 2,337 words',
  h4n: 'Harvard H4N',
};

/** For a chart axis and a card's method line, where the long form will not fit. */
export const TONE_DICTIONARY_SHORT: Record<ToneDictionary, string> = {
  'fin-neg': 'Fin-Neg',
  h4n: 'H4N',
};

/** How a term is weighted inside the bag-of-words. */
export type ToneWeighting = 'proportional' | 'tfidf';

export const TONE_WEIGHTINGS: readonly ToneWeighting[] = ['proportional', 'tfidf'];

export const TONE_WEIGHTING_LABEL: Record<ToneWeighting, string> = {
  proportional: 'Proportional',
  tfidf: 'tf.idf',
};

/**
 * The finding that makes the dictionary a choice rather than a detail: a list
 * built for a different domain misclassifies systematically in this one.
 */
export const H4N_MISCLASSIFICATION_NOTE =
  '73.8% of H4N negative words are not negative in a financial context — “tax”, “cost”, “capital”, “board”, “liability”, “foreign”, “vice”.';

/** The cadence news sentiment is aggregated at before it is used. */
export type NewsAggregation = 'daily' | 'weekly';

export const NEWS_AGGREGATIONS: readonly NewsAggregation[] = ['daily', 'weekly'];

export const NEWS_AGGREGATION_LABEL: Record<NewsAggregation, string> = {
  daily: 'Daily',
  weekly: 'Weekly',
};

/** Which method control, if any, a card carries. */
export type SignalMethod = 'none' | 'tone' | 'aggregation';

// --- the signals themselves ---------------------------------------------------

export type AltSignalId =
  | 'media-pessimism'
  | 'tenk-tone'
  | 'retail-attention'
  | 'social-mood'
  | 'news-analytics'
  | 'aggregate-sentiment';

/**
 * One card of the signal library, resolved against the universe and the
 * coverage window currently on screen.
 *
 * `temporal` is the library's own classification — the one printed on the card.
 * The classification under the method currently chosen lives on
 * `SignalDetailView` and is allowed to differ from it.
 */
export interface AltSignal {
  readonly id: AltSignalId;
  readonly name: string;
  readonly category: SignalCategory;
  /** What the card prints — `'Media tone'` where the chip says `'Tone'`. */
  readonly categoryLabel: string;
  readonly source: string;
  readonly summary: string;
  /** Share of the universe the feed reaches, per cent. */
  readonly coverage: number;
  /** The feed does not span the whole selected window. */
  readonly partialCoverage: boolean;
  /** Why it is partial — the window it does cover. Null when it is not. */
  readonly coverageNote: string | null;
  /** `'2026-07-30 21:00 UTC'`. */
  readonly updatedAt: string;
  readonly cadence: FeedCadence;
  readonly feed: FeedHealth;
  /** Set whenever `feed` is `failed`; the badge prints it. */
  readonly lastGoodAt: string | null;
  readonly temporal: TemporalClass;
  readonly method: SignalMethod;
}

// --- the detail panel ---------------------------------------------------------

/** One bar of a shock-response figure. */
export interface ResponsePoint {
  readonly label: string;
  readonly value: number;
}

/**
 * The response of the index to a one-standard-deviation move in the signal,
 * in basis points — pressure first, reversal after, cumulative last.
 */
export interface ShockResponseFigure {
  readonly kind: 'shock-response';
  readonly points: readonly ResponsePoint[];
  readonly unit: 'bp';
  readonly axisName: string;
}

/** One dictionary-weighting combination and what it measured. */
export interface ToneCombination {
  readonly dictionary: ToneDictionary;
  readonly weighting: ToneWeighting;
  /** `null` is not measured — the source reports no estimate for this pairing. */
  readonly tStat: number | null;
  readonly significant: boolean;
  /** `'significant'` · `'not distinct from zero'` · `'not reported'`. */
  readonly verdict: string;
}

export const TONE_NOT_REPORTED = 'not reported';

/** The 10-K figure: every combination, with the active one called out. */
export interface ToneMethodFigure {
  readonly kind: 'tone-methods';
  readonly combinations: readonly ToneCombination[];
  readonly active: ToneCombination;
  /** Two-sided 5% critical value, drawn as a reference line. */
  readonly criticalValue: number;
}

/** One row of the Granger-causality table for a mood dimension. */
export interface LagCausalityRow {
  readonly lag: number;
  readonly pValue: number;
  readonly significant: boolean;
}

export interface LagCausalityFigure {
  readonly kind: 'lag-causality';
  readonly rows: readonly LagCausalityRow[];
  readonly threshold: number;
  readonly dimension: string;
}

/** The news figure, which is a different figure per aggregation cadence. */
export interface NewsCadenceFigure {
  readonly kind: 'news-cadence';
  readonly aggregation: NewsAggregation;
  readonly points: readonly ResponsePoint[];
  readonly unit: '%';
  readonly axisName: string;
  /** `'one to two days'` · `'13 weeks — a full quarter'`. */
  readonly horizonLabel: string;
  /** What the *other* cadence gives, so the comparison is on screen either way. */
  readonly alternativeLabel: string;
}

/** One proxy's loading in the first principal component of the sentiment index. */
export interface SentimentLoading {
  readonly name: string;
  readonly value: number;
  /** The proxy enters lagged because it leads the others. */
  readonly lagged: boolean;
}

export interface LoadingsFigure {
  readonly kind: 'loadings';
  readonly basis: SentimentBasis;
  readonly loadings: readonly SentimentLoading[];
  /** Share of the proxies' variance the first component explains, per cent. */
  readonly varianceExplained: number;
}

export type SignalFigure =
  | ShockResponseFigure
  | ToneMethodFigure
  | LagCausalityFigure
  | NewsCadenceFigure
  | LoadingsFigure;

/**
 * Everything the detail panel shows for the card currently driving it.
 *
 * `temporal` is the verdict *under the method currently chosen*, which is why
 * it is here and not read off `signal.temporal`: News Analytics is filed as
 * Mixed and resolves to Transient or Persistent as the cadence toggle moves.
 */
export interface SignalDetailView {
  readonly signal: AltSignal;
  /** `'Text tone · cov. 74% · updated 2026-07-30'`. */
  readonly eyebrow: string;
  /** `'Fin-Neg · proportional'`, or null for a signal with no method control. */
  readonly methodLabel: string | null;
  readonly temporal: TemporalClass;
  /** Why the classification came out the way it did. */
  readonly verdict: string;
  readonly figureTitle: string;
  readonly figureSubtitle: string;
  readonly secondaryFlags: readonly string[];
  readonly figure: SignalFigure;
  /** Set on the aggregate index, whose evidence lives in the next tab. */
  readonly crossSectionalLink: boolean;
}

export const SECONDARY_FLAGS_LABEL = 'Secondary flags';

// --- cross-sectional sentiment ------------------------------------------------

export type SentimentRegime = 'high' | 'low';

export const SENTIMENT_REGIMES: readonly SentimentRegime[] = ['high', 'low'];

export const SENTIMENT_REGIME_LABEL: Record<SentimentRegime, string> = {
  high: 'High',
  low: 'Low',
};

export const SENTIMENT_REGIME_SERIES: Record<SentimentRegime, string> = {
  high: 'High sentiment',
  low: 'Low sentiment',
};

/** Raw first principal component, or the one orthogonalised to the macro series. */
export type SentimentBasis = 'sent' | 'sent-perp';

export const SENTIMENT_BASES: readonly SentimentBasis[] = ['sent', 'sent-perp'];

export const SENTIMENT_BASIS_LABEL: Record<SentimentBasis, string> = {
  sent: 'SENT',
  'sent-perp': 'SENT⊥',
};

/** Share of the proxies' variance each index explains, per cent. */
export const SENTIMENT_BASIS_VARIANCE: Record<SentimentBasis, number> = {
  sent: 49,
  'sent-perp': 53,
};

export const SENTIMENT_BASIS_DEFINITION: Record<SentimentBasis, string> = {
  sent: 'First principal component of the six market proxies, macroeconomic component included.',
  'sent-perp':
    'The same component after each proxy is orthogonalised to industrial production, consumption, employment and recessions — sentiment with the business cycle taken out.',
};

/**
 * The raw index still carries a macroeconomic component, so the spread it
 * conditions is not purely a sentiment spread and reads smaller. One documented
 * factor rather than a second table of numbers that could drift from the first.
 */
export const SENT_ATTENUATION = 0.88;

export type FirmCharacteristic =
  | 'size'
  | 'age'
  | 'volatility'
  | 'profitability'
  | 'dividend-policy'
  | 'growth'
  | 'distress';

export const FIRM_CHARACTERISTICS: readonly FirmCharacteristic[] = [
  'size',
  'age',
  'volatility',
  'profitability',
  'dividend-policy',
  'growth',
  'distress',
];

export const FIRM_CHARACTERISTIC_LABEL: Record<FirmCharacteristic, string> = {
  size: 'Size',
  age: 'Age',
  volatility: 'Volatility',
  profitability: 'Profitability',
  'dividend-policy': 'Dividend policy',
  growth: 'Growth',
  distress: 'Distress',
};

/** What D1 and D10 are, so a decile axis is never left to the reader to guess. */
export const FIRM_CHARACTERISTIC_AXIS: Record<FirmCharacteristic, string> = {
  size: 'D1 smallest · D10 largest',
  age: 'D1 youngest · D10 oldest',
  volatility: 'D1 least volatile · D10 most volatile',
  profitability: 'D1 least profitable · D10 most profitable',
  'dividend-policy': 'D1 non-payers · D10 highest payout',
  growth: 'D1 lowest growth · D10 highest growth',
  distress: 'D1 soundest · D10 most distressed',
};

/** Monotone across the deciles, or U-shaped with only the extremes reacting. */
export type DecileShape = 'monotone' | 'u-shaped';

export const DECILE_SHAPE_LABEL: Record<DecileShape, string> = {
  monotone: 'monotone across deciles',
  'u-shaped': 'U-shaped — only the extreme deciles react',
};

export interface DecileRow {
  /** 1 to 10. */
  readonly decile: number;
  /** Mean monthly return under high sentiment, per cent. */
  readonly high: number;
  /** Mean monthly return under low sentiment, per cent. */
  readonly low: number;
}

/**
 * The conditional cross-section for one characteristic.
 *
 * Both regimes are always present: the finding is that the pattern under high
 * sentiment attenuates or inverts under low sentiment, and a chart showing one
 * regime alone cannot state it. `regime` says which one the summary is read
 * for, not which one is drawn.
 */
export interface CrossSectionResult {
  readonly characteristic: FirmCharacteristic;
  readonly basis: SentimentBasis;
  readonly regime: SentimentRegime;
  readonly rows: readonly DecileRow[];
  /** D10 − D1 under high sentiment, per cent per month. */
  readonly spreadHigh: number;
  /** D10 − D1 under low sentiment. */
  readonly spreadLow: number;
  readonly shape: DecileShape;
  readonly note: string;
}

export const CROSS_SECTION_MODEL_NOTE =
  'Conditional characteristic model: E[R] = a + a₁T + b₁′x + b₂′Tx. The interaction term b₂′ is what makes a cross-sectional premium depend on sentiment.';

// --- ML aggregation -----------------------------------------------------------

export type MlModelId =
  | 'ols'
  | 'elastic-net'
  | 'pcr'
  | 'pls'
  | 'random-forest'
  | 'boosted-trees'
  | 'nn3';

/**
 * One candidate model for the aggregation.
 *
 * `ic` is null where there is nothing to report rather than zero: the
 * unregularised regression has a negative out-of-sample `R²`, so its forecasts
 * carry no information coefficient to quote and it takes no weight in the
 * score. A zero there would be a measurement nobody made.
 */
export interface MlModelRow {
  readonly id: MlModelId;
  readonly name: string;
  /** Out-of-sample `R²`, monthly, per cent. Measured against zero, not the mean. */
  readonly r2Oos: number;
  /** Information coefficient. Null when the model contributes nothing. */
  readonly ic: number | null;
  /** Weight in the aggregate score, per cent. The column sums to 100. */
  readonly weight: number;
  readonly note: string;
}

export const ML_PREDICTOR_NOTE =
  '94 firm characteristics interacted with eight macroeconomic series plus a constant, and 74 sector dummies: 94 × (8 + 1) + 74 = 920 base signals.';

export const ML_R2_NOTE =
  'R² out of sample is measured against zero rather than the historical mean return, so a negative value means the forecast is worse than predicting no premium at all.';

/** How the long-short decile spread behind the aggregate score is weighted. */
export type ScoreWeighting = 'value-weighted' | 'equal-weighted';

export const SCORE_WEIGHTINGS: readonly ScoreWeighting[] = ['value-weighted', 'equal-weighted'];

export const SCORE_WEIGHTING_LABEL: Record<ScoreWeighting, string> = {
  'value-weighted': 'Value-weighted',
  'equal-weighted': 'Equal-weighted',
};

/** One side of the aggregate-against-component comparison. */
export interface AggregateSide {
  readonly label: string;
  /** Out-of-sample `R²`, monthly, per cent. Independent of the weighting. */
  readonly r2Oos: number;
  /** Annualised Sharpe of the long-short decile spread, at this weighting. */
  readonly sharpe: number;
}

export interface AggregateComparison {
  readonly weighting: ScoreWeighting;
  readonly aggregate: AggregateSide;
  readonly bestComponent: AggregateSide;
  /** Annualised Sharpe of buying and holding the index. */
  readonly buyAndHoldSharpe: number;
  /** The same index, timed on the network's forecasts. */
  readonly marketTimingSharpe: number;
}

export const SHARPE_RELATION_NOTE =
  'SR* = √((SR² + R²) / (1 − R²)) — a small out-of-sample R² translates into a materially higher attainable Sharpe ratio.';

export const DOMINANT_SIGNALS_NOTE =
  'Every method agrees on the same short list: price trends first, then liquidity, then volatility. Text, attention and mood enter as incremental and conditioning information, not as replacements.';

// --- selection and the hand-over ----------------------------------------------

export const VIEWS_BUILDER_ROUTE = '/build/views-builder';

/** Query parameter Views Builder reads the pre-loaded candidates from. */
export const CANDIDATES_QUERY_PARAM = 'candidates';

export const SEND_DISABLED_REASON =
  'Select at least one signal — the checkbox on a card, or Space while the card has focus — before sending candidates to Views Builder.';

export const SELECTION_HINT =
  'Enter makes a card drive the detail panel. Space includes or excludes it, and never changes which card the detail is showing.';

export const INCLUDE_LABEL = 'Include in Views Builder';

// --- states and copy ----------------------------------------------------------

export const EMPTY_UNIVERSE_TITLE = 'No alternative-data coverage for this universe';

export const EMPTY_UNIVERSE_DETAIL =
  'No feed in the library reaches the names in this universe. Pick a universe with alternative-data coverage, or widen the window so a feed with a shorter history comes into range.';

export const EMPTY_WINDOW_TITLE = 'No signal covers this window';

export const EMPTY_WINDOW_DETAIL =
  'Every feed in the library starts after the end of the selected window, or ends before its start. Widen the coverage window, or change the universe.';

export const NO_MATCH_TITLE = 'No signal matches the current filters';

export const NO_MATCH_DETAIL =
  'Clear the search field, or switch a category chip back on. At least one category has to stay selected.';

export const EMPTY_DETAIL_TITLE = 'No signal selected';

export const EMPTY_DETAIL_DETAIL =
  'Press Enter on a card in the grid, or click it, and its evidence appears here.';

export const LOAD_FAILURE_MESSAGE = 'The signal library could not be loaded.';

export const LOAD_FAILURE_DETAIL =
  'The coverage and freshness of every feed is read in one call, and that call did not return. Nothing on the page has been changed — retry, or pick a different universe.';

export const CATEGORY_LAST_ONE_NOTE =
  'At least one category stays selected — turning the last one off would leave the grid with nothing to show and no way back except the search field.';

export const ALT_DATA_RELATED_PAGES: readonly { label: string; route: string }[] = [
  { label: 'Signals & Factors', route: '/build/signals-factors' },
  { label: 'Market Regimes', route: '/advanced-signals/market-regimes' },
  { label: 'Factor Timing & Rotation', route: '/advanced-signals/factor-timing-rotation' },
];
