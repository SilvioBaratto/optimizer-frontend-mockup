import { ChangeDetectionStrategy, Component, computed, signal } from '@angular/core';

import {
  BarChartComponent,
  BulletChartComponent,
  FrontierChartComponent,
  HistogramChartComponent,
  LineChartComponent,
  ScatterChartComponent,
  basisPoints,
  decimal,
  percent,
} from '../../shared/charts';
import type {
  BulletRow,
  CategorySeries,
  FrontierMarker,
  HistogramBin,
  Point,
  XySeries,
} from '../../shared/charts';
import { ButtonComponent } from '../../shared/ui/button/button';

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

/**
 * Gallery for the shared chart components — one instance of each of the six,
 * shaped like the figure it was built for in `docs/`. Doubles as the visual
 * check that the design tokens reach ECharts and that the loading state works
 * uniformly.
 */
@Component({
  selector: 'app-charts-test',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [
    BarChartComponent,
    BulletChartComponent,
    FrontierChartComponent,
    HistogramChartComponent,
    LineChartComponent,
    ScatterChartComponent,
    ButtonComponent,
  ],
  host: { class: 'block p-6 md:p-8' },
  template: `
    <h1 class="text-2xl font-semibold text-text">Chart components</h1>
    <p class="mt-1 text-sm text-text-secondary">
      Six reusable components over ECharts 6.1.0 · canvas renderer · lazy chunk · palette read
      from the design tokens.
    </p>

    <div class="mt-6 flex flex-wrap items-center gap-3">
      <app-button variant="secondary" (clicked)="toggleLoading()">
        Loading: {{ loading() ? 'on' : 'off' }}
      </app-button>
      <app-button variant="secondary" (clicked)="shuffle()">Re-randomise data</app-button>
      <span class="text-xs text-text-secondary" aria-live="polite">{{ status() }}</span>
    </div>

    <div class="mt-6 grid grid-cols-1 gap-6 xl:grid-cols-2">
      <app-frontier-chart
        title="Efficient frontier"
        subtitle="FrontierChart · docs 02, 08, 10, 13, 15"
        ariaLabel="Risk-return plane with the efficient frontier, capital allocation line and named portfolios"
        [curve]="frontier()"
        [inefficientBranch]="inefficientBranch()"
        [riskFreeRate]="riskFreeRate"
        [markers]="markers()"
        [assets]="assets"
        xAxisName="Volatility"
        yAxisName="Return"
        [loading]="loading()"
      />

      <app-bar-chart
        title="Euler risk contribution"
        subtitle="BarChart · diverging · docs 19, 22"
        ariaLabel="Risk contribution by component, with hedges shown as negative bars"
        [categories]="contribNames"
        [series]="contribSeries()"
        [valueFormatter]="pct"
        [loading]="loading()"
      />

      <app-line-chart
        title="VaR &amp; CVaR trend"
        subtitle="LineChart · reference lines and current-value marks · doc 18"
        ariaLabel="VaR and CVaR as a percentage of net asset value over twelve months"
        [x]="months"
        [series]="riskSeries()"
        [refLines]="varLimit"
        [refPoints]="riskNow()"
        [valueFormatter]="pct"
        yAxisName="% NAV"
        [loading]="loading()"
      />

      <app-line-chart
        title="Regime probability path"
        subtitle="LineChart · stacked area · doc 22"
        ariaLabel="Stacked probability of each market regime over twelve months"
        [x]="months"
        [series]="regimeSeries()"
        [area]="true"
        [stack]="true"
        [zoomable]="true"
        [valueFormatter]="pct"
        [loading]="loading()"
      />

      <app-scatter-chart
        title="Correlation diagnostic"
        subtitle="ScatterChart · one symbol per series · doc 22"
        ariaLabel="Exceedance correlation against threshold, empirical against three reference models"
        [series]="diagnosticSeries"
        xAxisName="θ (σ)"
        yAxisName="ρ"
        [loading]="loading()"
      />

      <app-histogram-chart
        title="Distribution of the logits λ"
        subtitle="HistogramChart · highlighted region · doc 09"
        ariaLabel="Frequency of CSCV logit values across six bins"
        [bins]="logitBins"
        annotation="Bins left of zero sum to the probability of backtest overfitting — PBO 0.031."
        [loading]="loading()"
      />

      <app-bullet-chart
        title="Value spread"
        subtitle="BulletChart · marker mode · doc 23"
        ariaLabel="Current z-score of each factor on its historical band"
        [rows]="valueSpread"
        mode="marker"
        [domainMin]="0"
        [domainMax]="2"
        [valueFormatter]="num"
        valueAxisName="z-score (mean → +2 SD)"
        [height]="220"
        [loading]="loading()"
      />

      <app-bar-chart
        title="Size premium by regime"
        subtitle="BarChart · diverging · null renders as “not available” · doc 22"
        ariaLabel="Size premium in basis points for each of four regimes"
        [categories]="regimeNames"
        [series]="premiumSeries"
        [valueFormatter]="bp"
        [height]="220"
        [loading]="loading()"
      />

    </div>
  `,
})
export class ChartsTestComponent {
  protected readonly pct = percent;
  protected readonly num = decimal;
  protected readonly bp = basisPoints;
  protected readonly months = MONTHS;

  protected readonly loading = signal(false);
  protected readonly status = signal('');
  private readonly seed = signal(0);

  // --- Frontier -----------------------------------------------------------
  // The frontier is generated from the closed form rather than typed out by
  // hand. Hand-picked points are almost never exactly concave, and a spline
  // through a curve whose slope wobbles renders as a visible serpentine.
  //   σ(r) = √(σ_g² + b·(r − r_g)²)
  private static readonly SIGMA_G = 6.2;
  private static readonly R_G = 4.1;
  protected readonly riskFreeRate = 3.2;

  /** Curvature. Re-randomising nudges it, and the tangency follows. */
  private readonly b = computed(() => 10.42 + this.seed() * 0.6);

  private sigma(r: number): number {
    const { SIGMA_G, R_G } = ChartsTestComponent;
    return Math.round(Math.sqrt(SIGMA_G ** 2 + this.b() * (r - R_G) ** 2) * 100) / 100;
  }

  /** Tangency return for this curvature: r_t = r_g + σ_g² / (b·(r_g − r_f)). */
  private readonly tangencyReturn = computed(() => {
    const { SIGMA_G, R_G } = ChartsTestComponent;
    return R_G + SIGMA_G ** 2 / (this.b() * (R_G - this.riskFreeRate));
  });

  /** Evenly spaced returns between two bounds, inclusive. */
  private static ramp(from: number, to: number, steps: number): number[] {
    const step = (to - from) / (steps - 1);
    return Array.from({ length: steps }, (_, i) => from + i * step);
  }

  /** Runs from the GMVP down and to the right — worse return for more risk. */
  protected readonly inefficientBranch = computed<Point[]>(() =>
    ChartsTestComponent.ramp(4.1, 1.4, 18).map((r) => [this.sigma(r), r] as Point),
  );

  protected readonly markers = computed<FrontierMarker[]>(() => {
    const rt = Math.round(this.tangencyReturn() * 10) / 10;
    return [
      { name: 'GMVP', x: ChartsTestComponent.SIGMA_G, y: ChartsTestComponent.R_G },
      { name: 'MDP', x: this.sigma(6.8), y: 6.8 },
      { name: 'Tangency', x: this.sigma(rt), y: rt, emphasis: true },
    ];
  });

  /** Individually inefficient: each sits to the right of the frontier. */
  protected readonly assets = [
    { name: 'AAA', x: 14.2, y: 5.1 },
    { name: 'BBB', x: 10.8, y: 5.9 },
    { name: 'DDD', x: 22.4, y: 7.9 },
  ];

  protected readonly frontier = computed<(Point | null)[]>(() => {
    // Dense enough that straight segments read as a curve, which is also what a
    // solver actually returns — a list of computed points, not an equation.
    const returns = ChartsTestComponent.ramp(4.1, 9.3, 40).map(
      (r) => Math.round(r * 100) / 100,
    );
    const points: (Point | null)[] = returns.map((r) => [this.sigma(r), r] as Point);
    // A null is a genuine break: the solver did not converge in this stretch.
    points.splice(20, 6, null);
    return points;
  });

  // --- Diverging bar ------------------------------------------------------
  protected readonly contribNames = ['AAPL', 'MSFT', 'UST 10Y', 'Gold', 'TLT'];
  protected readonly contribSeries = computed<CategorySeries[]>(() => {
    const j = this.seed() * 0.15;
    return [
      { name: 'Euler contribution', data: [4.2 + j, 3.1, 1.9, 0.8, -0.8] },
    ];
  });

  // --- Risk trend ---------------------------------------------------------
  protected readonly varLimit = [{ value: 5, label: 'limit 5.0%' }];
  protected readonly riskSeries = computed<CategorySeries[]>(() => {
    const j = this.seed() * 0.1;
    return [
      { name: 'VaR', data: [2.9, 3.0, 3.2, 3.1, 3.4, 3.3, 3.5, 3.4, 3.6, 3.5, 3.4, 3.42 + j] },
      { name: 'CVaR', data: [4.1, 4.2, 4.5, 4.4, 4.7, 4.6, 4.9, 4.8, 5.0, 4.9, 4.9, 4.87 + j] },
    ];
  });
  protected readonly riskNow = computed(() => [
    { x: 'Dec', y: 4.87 + this.seed() * 0.1, label: 'CVaR 4.87%' },
  ]);

  // --- Stacked regime bands ----------------------------------------------
  protected readonly regimeSeries = computed<CategorySeries[]>(() => {
    const j = this.seed();
    return [
      { name: 'Crash', data: [10, 12, 18, 26, 34, 44, 52, 58, 55, 48, 40, 34 + j] },
      { name: 'Slow growth', data: [22, 24, 26, 28, 27, 24, 22, 20, 21, 24, 26, 28] },
      { name: 'Bull', data: [48, 44, 38, 30, 24, 18, 14, 12, 14, 18, 22, 26] },
      { name: 'Recovery', data: [20, 20, 18, 16, 15, 14, 12, 10, 10, 10, 12, 12] },
    ];
  });

  // --- Scatter diagnostic -------------------------------------------------
  protected readonly diagnosticSeries: XySeries[] = [
    {
      name: 'Empirical',
      points: [
        [-2, 0.72],
        [-1, 0.58],
        [0, 0.41],
        [1, 0.3],
        [2, 0.24],
      ],
    },
    {
      name: 'Regime-switching',
      points: [
        [-2, 0.66],
        [-1, 0.54],
        [0, 0.42],
        [1, 0.33],
        [2, 0.28],
      ],
    },
    {
      name: 'Normal',
      points: [
        [-2, 0.4],
        [-1, 0.41],
        [0, 0.42],
        [1, 0.41],
        [2, 0.4],
      ],
    },
  ];

  // --- Histogram ----------------------------------------------------------
  protected readonly logitBins: HistogramBin[] = [
    { label: 'λ < −2', value: 0.4, highlight: true },
    { label: '−2 … −1', value: 0.9, highlight: true },
    { label: '−1 … 0', value: 1.8, highlight: true },
    { label: '0 … 1', value: 14.2 },
    { label: '1 … 2', value: 31.5 },
    { label: 'λ > 2', value: 51.2 },
  ];

  // --- Bullet -------------------------------------------------------------
  protected readonly valueSpread: BulletRow[] = [
    { label: 'HML', value: 0.82, min: 0.2, max: 1.6, status: 'ordinary' },
    { label: 'UMD', value: 0.95, min: 0.3, max: 1.5, status: 'ordinary' },
    { label: 'BAB', value: 1.72, min: 0.4, max: 1.8, status: 'elevated' },
  ];

  // --- Hatched "not available" -------------------------------------------
  protected readonly regimeNames = ['Crash', 'Slow growth', 'Bull', 'Recovery'];
  protected readonly premiumSeries: CategorySeries[] = [
    { name: 'Size premium', data: [100, -61, 71, null] },
  ];

  protected toggleLoading(): void {
    this.loading.update((v) => !v);
    this.status.set(this.loading() ? 'Loading overlay shown' : 'Loading overlay hidden');
  }

  protected shuffle(): void {
    this.seed.update((s) => (s + 1) % 5);
    this.status.set('Options replaced — charts updated in place');
  }
}
