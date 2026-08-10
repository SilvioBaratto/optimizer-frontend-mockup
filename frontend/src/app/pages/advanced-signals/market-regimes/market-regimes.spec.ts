/**
 * The page as a whole: eleven regions in the wireframe's order, the four
 * states, and the two invariants that span regions.
 *
 * Every chart is stubbed — ECharts wants a canvas and jsdom has none — and each
 * stub renders the `<h3>` the real `ChartPanel` renders, so the heading outline
 * asserted below is the one a reader would actually get.
 *
 * The two cross-region behaviours are what this file is really for:
 *
 * - the hero card and the bridge card can never disagree, so the tests move the
 *   toolbar and assert both ends at once;
 * - the three state vocabularies never blend, so the tests read the panels'
 *   own contents and check that no state name crosses from one to another.
 */

import { Component, computed, input } from '@angular/core';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';

import { MarketRegimesService } from '../../../services/market-regimes.service';
import {
  BarChartComponent,
  BulletChartComponent,
  LineChartComponent,
  ScatterChartComponent,
} from '../../../shared/charts';
import type {
  BulletRow,
  CategorySeries,
  RefLine,
  ValueFormatter,
  XySeries,
} from '../../../shared/charts';
import { CorrelationDiagnostic } from './correlation-diagnostic/correlation-diagnostic';
import { MacroNowcast } from './macro-nowcast/macro-nowcast';
import { MarketRegimes } from './market-regimes';
import { MomentumStatePanel } from './momentum-state/momentum-state';
import { ProbabilityPath } from './probability-path/probability-path';
import { SizePremium } from './size-premium/size-premium';
import { ValuePremium } from './value-premium/value-premium';

/** What every stub renders: the panel's own `<h3>`, plus the cells it was handed. */
const PANEL_TEMPLATE = `
  <div [attr.data-aria-label]="ariaLabel()">
    <h3>{{ title() }}</h3>
    <span class="chart-cells">{{ cells() }}</span>
    <ng-content />
  </div>
`;

@Component({ selector: 'app-line-chart', template: PANEL_TEMPLATE })
class LineChartStub {
  readonly title = input('');
  readonly subtitle = input('');
  readonly ariaLabel = input('');
  readonly x = input.required<readonly (string | number)[]>();
  readonly series = input.required<readonly CategorySeries[]>();
  readonly valueFormatter = input<ValueFormatter>((value) => String(value));
  readonly stack = input(false);
  readonly area = input(false);
  readonly zoomable = input(false);
  readonly zoomStart = input(0);
  readonly optionPatch = input<Record<string, unknown>>({});
  readonly xAxisName = input('');
  readonly yAxisName = input('');
  readonly height = input(320);

  protected readonly cells = computed(() => this.series().map((band) => band.name).join(', '));
}

@Component({ selector: 'app-scatter-chart', template: PANEL_TEMPLATE })
class ScatterChartStub {
  readonly title = input('');
  readonly subtitle = input('');
  readonly ariaLabel = input('');
  readonly series = input.required<readonly XySeries[]>();
  readonly refLines = input<readonly RefLine[]>([]);
  readonly valueFormatter = input<ValueFormatter>((value) => String(value));
  readonly xAxisName = input('');
  readonly yAxisName = input('');
  readonly height = input(320);

  protected readonly cells = computed(() => this.series().map((s) => s.name).join(', '));
}

@Component({ selector: 'app-bullet-chart', template: PANEL_TEMPLATE })
class BulletChartStub {
  readonly title = input('');
  readonly subtitle = input('');
  readonly ariaLabel = input('');
  readonly rows = input.required<readonly BulletRow[]>();
  readonly valueFormatter = input<ValueFormatter>((value) => String(value));
  readonly domainMin = input<number | undefined>(undefined);
  readonly domainMax = input<number | undefined>(undefined);
  readonly valueAxisName = input('');
  readonly height = input(320);

  protected readonly cells = computed(() => this.rows().map((row) => row.label).join(', '));
}

@Component({ selector: 'app-bar-chart', template: PANEL_TEMPLATE })
class BarChartStub {
  readonly title = input('');
  readonly subtitle = input('');
  readonly ariaLabel = input('');
  readonly categories = input.required<readonly string[]>();
  readonly series = input.required<readonly CategorySeries[]>();
  readonly valueFormatter = input<ValueFormatter>((value) => String(value));
  readonly unavailableLabel = input('not available');
  readonly valueMax = input<number | undefined>(undefined);
  readonly categoryAxisName = input('');
  readonly valueAxisName = input('');
  readonly showLegend = input<boolean | undefined>(undefined);
  readonly height = input(320);

  /** Category and series names — enough to see which vocabulary a panel is on. */
  protected readonly cells = computed(
    () => `${this.categories().join(' / ')} :: ${this.series().map((s) => s.name).join(', ')}`,
  );
}

describe('MarketRegimes page', () => {
  let fixture: ComponentFixture<MarketRegimes>;
  let host: HTMLElement;
  let service: MarketRegimesService;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [MarketRegimes],
      providers: [provideRouter([])],
    })
      .overrideComponent(ProbabilityPath, {
        remove: { imports: [LineChartComponent] },
        add: { imports: [LineChartStub] },
      })
      .overrideComponent(CorrelationDiagnostic, {
        remove: { imports: [ScatterChartComponent] },
        add: { imports: [ScatterChartStub] },
      })
      .overrideComponent(MacroNowcast, {
        remove: { imports: [BulletChartComponent] },
        add: { imports: [BulletChartStub] },
      })
      .overrideComponent(MomentumStatePanel, {
        remove: { imports: [BarChartComponent] },
        add: { imports: [BarChartStub] },
      })
      .overrideComponent(SizePremium, {
        remove: { imports: [BarChartComponent] },
        add: { imports: [BarChartStub] },
      })
      .overrideComponent(ValuePremium, {
        remove: { imports: [BarChartComponent] },
        add: { imports: [BarChartStub] },
      })
      .compileComponents();

    fixture = TestBed.createComponent(MarketRegimes);
    host = fixture.nativeElement;
    service = TestBed.inject(MarketRegimesService);
    document.body.appendChild(host);
    fixture.detectChanges();
  });

  afterEach(() => host.remove());

  function text(testId: string): string {
    return host.querySelector(`[data-testid="${testId}"]`)?.textContent?.replace(/\s+/g, ' ').trim() ?? '';
  }

  function region(selector: string): HTMLElement {
    const match = host.querySelector(selector);
    expect(match).toBeTruthy();
    return match as HTMLElement;
  }

  function regionText(selector: string): string {
    return (region(selector).textContent ?? '').replace(/\s+/g, ' ');
  }

  async function settle(): Promise<void> {
    await service.settled();
    fixture.detectChanges();
  }

  // --- the regions ----------------------------------------------------------

  it('when the page renders, the eleven regions are in the wireframe order', () => {
    const selectors = [
      'app-market-regimes-toolbar',
      'app-market-regimes-dominant-state',
      'app-market-regimes-probability-path',
      'app-market-regimes-statistics',
      'app-market-regimes-correlation-diagnostic',
      'app-market-regimes-macro-nowcast',
      'app-market-regimes-momentum-state',
      'app-market-regimes-size-premium',
      'app-market-regimes-value-premium',
      'app-market-regimes-view-bridge',
      'app-market-regimes-diagnostics',
    ];
    const rendered = Array.from(host.querySelectorAll(selectors.join(','))).map((element) =>
      element.tagName.toLowerCase(),
    );
    expect(rendered).toEqual(selectors);
  });

  it('when the page renders, its outline starts at h2 and skips no level', () => {
    const levels = Array.from(host.querySelectorAll('h1,h2,h3,h4,h5,h6')).map((heading) =>
      Number(heading.tagName.slice(1)),
    );
    expect(levels.length).toBeGreaterThan(10);
    // The shell owns the <h1>; the page owns h2 for its regions and h3 for the
    // panels inside them, and nothing may appear before its parent level.
    expect(levels).not.toContain(1);
    expect(levels[0]).toBe(2);
    let deepest = 2;
    for (const level of levels) {
      expect(level).toBeLessThanOrEqual(deepest + 1);
      deepest = Math.max(deepest, level);
    }
    expect(deepest).toBe(3);
  });

  it('when the page renders, every region labels itself at the same level', () => {
    // The eleven regions the spec lists are peers. Two of them are info cards,
    // whose `title` input renders at h3 — at that level the primary action and
    // the diagnostics footer came out nested under "Value premium" in the
    // outline, and "Draft view" came out as a sibling of the card holding it.
    const regionLabels = Array.from(host.querySelectorAll('h2')).map((heading) =>
      (heading.textContent ?? '').replace(/\s+/g, ' ').trim(),
    );
    expect(regionLabels).toEqual(
      expect.arrayContaining(['Regime-implied view', 'Diagnostics', 'Momentum state']),
    );
  });

  it('when the page renders, a skip link leads past the toolbar to the estimate', () => {
    const skip = host.querySelector('a.skip-link') as HTMLAnchorElement;
    expect(skip.getAttribute('href')).toBe('#market-regimes-content');
    expect(host.querySelector('#market-regimes-content')).toBeTruthy();
  });

  it('when the page renders, the exits the spec names are offered', () => {
    const links = Array.from(host.querySelectorAll('app-cross-page-link a')).map((link) =>
      link.textContent?.trim(),
    );
    expect(links).toEqual(
      expect.arrayContaining([
        'Macro & Regimes Agent →',
        'Views Builder →',
        'Factor Timing & Rotation →',
      ]),
    );
  });

  // --- the hero and the bridge cannot disagree ------------------------------

  it('when the estimate changes, the hero card and the bridge card move together', async () => {
    expect(host.querySelector('app-hero-stat-card h2')?.textContent?.trim()).toBe('Crash 58%');
    expect(text('mr-bridge-derived-from')).toBe('Crash 58%');
    expect(text('mr-bridge-direction')).toBe('▼ Defensive');

    service.setUniverse('equities-only');
    await settle();

    expect(host.querySelector('app-hero-stat-card h2')?.textContent?.trim()).toBe('Bull 56%');
    expect(text('mr-bridge-derived-from')).toBe('Bull 56%');
    expect(text('mr-bridge-direction')).toBe('▲ Risk-on');

    service.setUniverse('global-multi-asset');
    await settle();

    expect(host.querySelector('app-hero-stat-card h2')?.textContent?.trim()).toBe('Slow Growth 44%');
    expect(text('mr-bridge-derived-from')).toBe('Slow Growth 44%');
    expect(text('mr-bridge-direction')).toBe('▬ Neutral');
  });

  // --- the three vocabularies -----------------------------------------------

  it('when the panels render, the size premium is on the regime model vocabulary', () => {
    const cells = region('app-market-regimes-size-premium .chart-cells').textContent ?? '';
    expect(cells).toContain('Crash / Slow Growth / Bull / Recovery');
  });

  it('when the panels render, the value premium is on a vocabulary of its own', () => {
    const cells = region('app-market-regimes-value-premium .chart-cells').textContent ?? '';
    expect(cells).toContain('High-volatility state, recession-linked');
    expect(cells).toContain('Low-volatility state, expansion-linked');
    for (const state of ['Crash', 'Slow Growth', 'Bull', 'Recovery', 'UP', 'DOWN']) {
      expect(cells).not.toContain(state);
    }
  });

  it('when the panels render, momentum is on a third vocabulary that shares nothing', () => {
    const momentum = regionText('app-market-regimes-momentum-state');
    expect(momentum).toContain('UP');
    for (const state of [
      'Crash',
      'Slow Growth',
      'Recovery',
      'Recession',
      'Expansion',
      'High-volatility state',
      'Low-volatility state',
    ]) {
      expect(momentum).not.toContain(state);
    }
  });

  it('when the regime model drops to two states, only the regime-model regions follow', async () => {
    service.setModel('hamilton');
    await settle();

    expect(regionText('app-market-regimes-dominant-state')).toContain('Recession');
    expect(regionText('app-market-regimes-probability-path')).toContain('Recession, Expansion');
    expect(regionText('app-market-regimes-statistics')).toContain('Recession');

    // The other two vocabularies are untouched by it.
    expect(region('app-market-regimes-size-premium .chart-cells').textContent).toContain(
      'Crash / Slow Growth / Bull / Recovery',
    );
    expect(region('app-market-regimes-value-premium .chart-cells').textContent).toContain(
      'High-volatility state, recession-linked',
    );
    expect(regionText('app-market-regimes-momentum-state')).toContain('UP');
  });

  // --- the four states ------------------------------------------------------

  it('when the estimate settles, the live region carries the new reading', async () => {
    const live = host.querySelector('[data-testid="mr-live-summary"]') as HTMLElement;
    expect(live.getAttribute('role')).toBe('status');
    expect(live.textContent).toContain('Crash 58%');
    expect(live.textContent).toContain('Equities + Bonds');

    const run = service.refresh();
    fixture.detectChanges();
    expect(live.textContent).toContain('Re-estimating');

    await run;
    service.setUniverse('equities-only');
    await settle();

    // The same node throughout: a live region that is removed when the run ends
    // announces nothing, which left the settled reading unspoken.
    expect(host.querySelector('[data-testid="mr-live-summary"]')).toBe(live);
    expect(live.textContent).toContain('Bull 56%');
    expect(live.textContent).toContain('Equities only');
  });

  it('while the filter re-runs, a placeholder stands in for every panel', async () => {
    const run = service.refresh();
    fixture.detectChanges();

    const loading = host.querySelector('[data-testid="mr-loading"]');
    expect(loading?.getAttribute('aria-busy')).toBe('true');
    expect(loading?.querySelectorAll('app-skeleton-block').length).toBe(8);
    expect(host.querySelector('app-market-regimes-toolbar')).toBeTruthy();
    expect(host.querySelector('app-market-regimes-dominant-state')).toBeNull();

    await run;
    fixture.detectChanges();
    expect(host.querySelector('app-market-regimes-dominant-state')).toBeTruthy();
  });

  it('when the combination cannot be estimated, the dependent regions say so and the rest stay', async () => {
    service.setUniverse('em-equities');
    await settle();

    expect(service.state()).toBe('empty');
    expect(text('mr-dominant-empty')).toContain('No data for this combination');
    expect(text('mr-path-empty')).toContain('No data for this combination');
    expect(text('mr-statistics-empty')).toContain('fewer than 24 months');
    expect(text('mr-correlation-empty')).toContain('no pair of series to correlate');

    // The panels that do not depend on the filter keep their readings.
    expect(text('mr-nowcast-gdp')).toBe('+1.4% q/q');
    expect(regionText('app-market-regimes-size-premium')).toContain('161 bp');
    expect(regionText('app-market-regimes-value-premium')).toContain('2-state Markov');
  });

  it('when the estimate fails, the last figures stay and are labelled as old', async () => {
    await service.refresh(true);
    fixture.detectChanges();

    const failure = host.querySelector('[data-testid="mr-load-error"] [role="status"]');
    expect(failure?.textContent).toContain('did not converge');
    expect(failure?.textContent).toContain('are stale');
    // The estimate is not blanked: "no reading" and "the last one that
    // converged" are different situations and only one of them happened.
    expect(host.querySelector('app-hero-stat-card h2')?.textContent?.trim()).toBe('Crash 58%');
    expect(host.querySelector('.grayscale')).toBeTruthy();
  });

  it('when the estimate is retried, the failure clears and the page reads current again', async () => {
    await service.refresh(true);
    fixture.detectChanges();

    (host.querySelector('[data-testid="mr-load-error"] button') as HTMLButtonElement).click();
    await new Promise((resolve) => setTimeout(resolve, 800));
    fixture.detectChanges();

    expect(host.querySelector('[data-testid="mr-load-error"]')).toBeNull();
    expect(host.querySelector('.grayscale')).toBeNull();
  });

  it('when the hand-over fails, the page is not greyed and the failure stays with the button', async () => {
    await service.sendView(true);
    fixture.detectChanges();

    expect(host.querySelector('[data-testid="mr-load-error"]')).toBeNull();
    expect(host.querySelector('.grayscale')).toBeNull();
    expect(host.querySelector('[data-testid="mr-bridge-error"] [role="alert"]')).toBeTruthy();
  });

  // --- the edge cases the spec lists ----------------------------------------

  it('when the sample window is put out of order, the page lands on empty and never on loading', () => {
    service.setSampleTo('1989-01');
    fixture.detectChanges();

    expect(service.state()).toBe('empty');
    expect(text('mr-sample-error')).toContain('must come before its end');
    expect(text('mr-dominant-empty')).toContain('Pick a “from” month earlier');
  });

  it('when the nowcast vintage falls behind the filter, the badge is text', async () => {
    service.setSampleTo('2026-08');
    await settle();

    expect(text('mr-stale-vintage')).toContain('Stale vintage');
  });

  it('when the filter is low-confidence, the footer says so in words', () => {
    expect(text('mr-low-confidence')).toContain('Filter confidence low this week');
    expect(host.querySelector('[data-testid="mr-low-confidence"]')?.getAttribute('role')).toBe(
      'status',
    );
  });

  it('when a universe lacks a pair of series, the correlation cells read n/d', async () => {
    service.setUniverse('equities-only');
    await settle();

    expect(host.querySelector('[data-equity-bond="Crash"]')?.textContent?.trim()).toBe('n/d');
    expect(host.querySelector('[data-large-small="Crash"]')?.textContent?.trim()).toBe('0.82');
  });
});
