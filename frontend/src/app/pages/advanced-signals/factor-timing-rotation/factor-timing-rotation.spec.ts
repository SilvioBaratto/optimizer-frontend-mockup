/**
 * The page as a whole: eight regions in the wireframe's order, the four states,
 * and the three constraints that span regions.
 *
 * Every chart is stubbed — ECharts wants a canvas and jsdom has none — and each
 * stub renders the `<h3>` the real `ChartPanel` renders, so the heading outline
 * asserted below is the one a reader would actually get.
 *
 * The cross-region behaviours are what this file is really for:
 *
 * - the Regime & Market State card reads the **shared** engine, so the tests
 *   drive `MarketRegimesService` and read this page;
 * - the valuation of a factor is one number, so the tests compare the signal
 *   table's arrow with the Value Spread callout rather than with a string;
 * - the guardrail banner's dismissal is scoped, so the tests dismiss it and
 *   then change the conflict.
 */

import { Component, computed, input } from '@angular/core';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';

import { FactorTimingService } from '../../../services/factor-timing.service';
import { MarketRegimesService } from '../../../services/market-regimes.service';
import { BarChartComponent, BulletChartComponent, LineChartComponent } from '../../../shared/charts';
import type { BulletRow, CategorySeries, ValueFormatter } from '../../../shared/charts';
import { ExcessReturnChart } from './excess-return-chart/excess-return-chart';
import { FactorTimingRotation } from './factor-timing-rotation';
import { TimingComparison } from './timing-comparison/timing-comparison';
import { ValueSpread } from './value-spread/value-spread';

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
  readonly xAxisName = input('');
  readonly yAxisName = input('');
  readonly showLegend = input<boolean | undefined>(undefined);
  readonly height = input(320);

  protected readonly cells = computed(() => this.series().map((entry) => entry.name).join(','));
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
  readonly optionPatch = input<Record<string, unknown>>({});
  readonly height = input(320);

  protected readonly cells = computed(() => {
    const format = this.valueFormatter();
    return this.categories()
      .map((category, index) => {
        const drawn = this.series()
          .map((series) => {
            const value = series.data[index];
            const missing = value === null || value === undefined;
            return `${series.name}=${missing ? this.unavailableLabel() : format(value)}${
              !missing && series.pattern ? '(hatched)' : ''
            }`;
          })
          .join(', ');
        return `${category} [${drawn}]`;
      })
      .join(' | ');
  });
}

@Component({ selector: 'app-bullet-chart', template: PANEL_TEMPLATE })
class BulletChartStub {
  readonly title = input('');
  readonly subtitle = input('');
  readonly ariaLabel = input('');
  readonly rows = input.required<readonly BulletRow[]>();
  readonly mode = input<'fill' | 'marker'>('fill');
  readonly domainMin = input<number | undefined>(undefined);
  readonly domainMax = input<number | undefined>(undefined);
  readonly valueFormatter = input<ValueFormatter>((value) => String(value));
  readonly valueAxisName = input('');
  readonly height = input(320);

  protected readonly cells = computed(() => {
    const format = this.valueFormatter();
    return this.rows()
      .map((row) => `${row.label}=${format(row.value)} ${row.status ?? ''}`.trim())
      .join(' | ');
  });
}

describe('FactorTimingRotation', () => {
  let fixture: ComponentFixture<FactorTimingRotation>;
  let host: HTMLElement;
  let service: FactorTimingService;
  let regimes: MarketRegimesService;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [FactorTimingRotation],
      providers: [provideRouter([])],
    })
      .overrideComponent(ValueSpread, {
        remove: { imports: [BulletChartComponent] },
        add: { imports: [BulletChartStub] },
      })
      .overrideComponent(ExcessReturnChart, {
        remove: { imports: [LineChartComponent] },
        add: { imports: [LineChartStub] },
      })
      .overrideComponent(TimingComparison, {
        remove: { imports: [BarChartComponent] },
        add: { imports: [BarChartStub] },
      })
      .compileComponents();

    fixture = TestBed.createComponent(FactorTimingRotation);
    host = fixture.nativeElement;
    service = TestBed.inject(FactorTimingService);
    regimes = TestBed.inject(MarketRegimesService);
    fixture.detectChanges();
  });

  function text(testId: string): string {
    return host.querySelector(`[data-testid="${testId}"]`)?.textContent?.replace(/\s+/g, ' ').trim() ?? '';
  }

  function headings(level: string): string[] {
    return Array.from(host.querySelectorAll(level)).map((node) =>
      (node.textContent ?? '').replace(/\s+/g, ' ').trim(),
    );
  }

  async function settle(): Promise<void> {
    await service.settled();
    fixture.detectChanges();
  }

  // --- the regions, in the wireframe's order -------------------------------

  it('when the page renders, every region is present in the wireframe’s order', () => {
    const regions = Array.from(
      host.querySelectorAll(
        'app-factor-timing-toolbar, app-factor-timing-regime-state, app-factor-timing-value-spread,' +
          ' app-factor-timing-excess-return, app-factor-timing-signal-table,' +
          ' app-factor-timing-comparison, app-factor-timing-guardrails, app-factor-timing-actions',
      ),
    ).map((node) => node.tagName.toLowerCase());

    expect(regions).toEqual([
      'app-factor-timing-toolbar',
      'app-factor-timing-regime-state',
      'app-factor-timing-value-spread',
      'app-factor-timing-excess-return',
      'app-factor-timing-signal-table',
      'app-factor-timing-comparison',
      'app-factor-timing-guardrails',
      'app-factor-timing-actions',
    ]);
  });

  it('when the page renders, the outline starts at h2 with no level skipped', () => {
    expect(host.querySelector('h1')).toBeNull();
    expect(headings('h2')).toEqual([
      'Factor timing controls',
      'Regime & market state',
      'Value spread',
      '3Y rolling factor excess return vs market',
      'Factor signals & tilts',
      'Timing comparison — information ratio, out of sample',
    ]);
    expect(headings('h3').length).toBeGreaterThan(0);
  });

  it('when the page renders, a skip link reaches the content past the toolbar', () => {
    const link = host.querySelector('a.skip-link');
    expect(link?.getAttribute('href')).toBe('#ft-content');
    expect(host.querySelector('#ft-content')?.getAttribute('tabindex')).toBe('-1');
  });

  it('when the skip link is followed, focus lands on the content and the page stays', () => {
    const link = host.querySelector<HTMLElement>('a.skip-link');
    const event = new MouseEvent('click', { bubbles: true, cancelable: true });
    link?.dispatchEvent(event);

    // `<base href="/">` resolves a bare fragment against the base rather than
    // the document, so following it literally loads `/` — the dashboard.
    expect(event.defaultPrevented).toBe(true);
    expect(document.activeElement).toBe(host.querySelector('#ft-content'));
  });

  // --- one regime engine ----------------------------------------------------

  it('when the shared regime model switches, the page’s regime card follows it', async () => {
    regimes.setModel('hamilton');
    await regimes.settled();
    fixture.detectChanges();

    const shown = Array.from(host.querySelectorAll('[data-regime-state]')).map((node) =>
      node.getAttribute('data-regime-state'),
    );
    expect(shown).toEqual(['Recession', 'Expansion']);
  });

  it('when the shared filter fails, only the regime card errors and the signals stay', async () => {
    await regimes.refresh(true);
    fixture.detectChanges();

    expect(text('ft-regime-error')).toContain('Regime model failed to converge');
    // The rest of the page is still a reading, marked stale rather than blanked.
    expect(host.querySelector('[data-signal-row="value"]')).toBeTruthy();
    expect(host.querySelector('[data-testid="ft-load-error"]')).toBeNull();
    expect(service.stale()).toBe(true);
  });

  // --- one number for a factor's valuation ---------------------------------

  it('when a row conflicts, the table’s arrow and the callout report the same valuation', () => {
    const arrow = host.querySelector('[data-valuation="momentum"]')?.textContent ?? '';
    const callout = text('ft-extrapolation-summary');

    // The table says unfavourable — rich — so the callout must not say cheap.
    expect(arrow).toContain('unfavourable');
    expect(callout).toContain('valuation reads rich');
    expect(callout).not.toContain('cheap');
  });

  it('when the metric changes, the band and the table’s arrow move together', async () => {
    service.setValueSpreadMetric('price-book');
    await settle();

    const row = service.signalRows().find((entry) => entry.factor === 'quality');
    const badge = host.querySelector('[data-spread-badge="quality"]')?.textContent ?? '';
    const arrow = host.querySelector('[data-valuation="quality"]')?.textContent ?? '';

    expect(badge).toContain('elevated');
    expect(row?.valuation).toBe('down');
    expect(arrow).toContain('unfavourable');
  });

  it('when the callout points at the guardrails, following it lands on the notice', () => {
    const link = host.querySelector<HTMLElement>('[data-testid="ft-extrapolation-banner-link"]');
    const target = link?.getAttribute('aria-controls') ?? '';
    const anchor = host.querySelector(`#${target}`);

    expect(target).toBe('ft-guardrail-banner');
    expect(anchor).toBeTruthy();

    link?.click();

    // The reference has to arrive somewhere. Before, it was an `<a href="#…">`
    // and `<base href="/">` sent it to the dashboard instead.
    expect(document.activeElement).toBe(anchor);
  });

  // --- absent is never zero -------------------------------------------------

  it('when a variant has no information ratio, the page hatches it rather than zeroing it', () => {
    const cells = Array.from(host.querySelectorAll('.chart-cells'))
      .map((node) => node.textContent ?? '')
      .join(' ');

    expect(cells).toContain('Not measured=not measured(hatched)');
    expect(cells).not.toContain('Information ratio, out of sample=0.00');
  });

  it('when a factor has no history, the page says so rather than scoring it at zero', () => {
    expect(host.querySelector('[data-insufficient="profitability"]')?.textContent).toContain(
      'insufficient history',
    );
    expect(service.scoredRows().some((row) => row.factor === 'profitability')).toBe(false);
  });

  // --- the guardrail banner -------------------------------------------------

  it('when the guardrail notice is dismissed, a new conflict brings it back', async () => {
    expect(host.querySelector('[data-testid="ft-guardrail-notice"]')).toBeTruthy();

    (host.querySelector('[data-testid="ft-guardrail-dismiss"]') as HTMLElement).click();
    fixture.detectChanges();
    expect(host.querySelector('[data-testid="ft-guardrail-notice"]')).toBeNull();

    service.setFactorsInView(['value', 'size', 'quality']);
    await settle();

    expect(host.querySelector('[data-testid="ft-guardrail-notice"]')).toBeTruthy();
  });

  // --- the four states ------------------------------------------------------

  it('while the signals recompute, placeholders stand in at the panels’ own heights', async () => {
    const run = service.refresh();
    fixture.detectChanges();

    expect(host.querySelector('[data-testid="ft-loading"]')?.getAttribute('aria-busy')).toBe('true');
    expect(host.querySelectorAll('[data-testid="ft-loading"] app-skeleton-block').length).toBe(5);
    // The toolbar stays; only the content below it is replaced.
    expect(host.querySelector('app-factor-timing-toolbar')).toBeTruthy();
    expect(host.querySelector('app-factor-timing-signal-table')).toBeNull();

    await run;
    fixture.detectChanges();
    expect(host.querySelector('[data-testid="ft-loading"]')).toBeNull();
  });

  it('when nothing can be scored, the empty state offers the way forward', async () => {
    service.setFactorsInView(['profitability']);
    await settle();

    expect(text('ft-empty')).toContain('No signals available');
    expect(text('ft-empty')).toContain('enough price history');
    expect(
      host.querySelector('[data-testid="ft-empty"] a[href="/build/universe-data"]')?.textContent,
    ).toContain('Configure universe and data window');
    // The shared regime reading does not depend on this page's cross-section.
    expect(host.querySelector('app-factor-timing-regime-state')).toBeTruthy();
    expect(host.querySelector('app-factor-timing-signal-table')).toBeNull();
    expect(host.querySelector('app-factor-timing-excess-return')).toBeNull();
  });

  it('when nothing can be scored, the card and the comparison stand in rather than vanish', async () => {
    service.setFactorsInView(['profitability']);
    await settle();

    // The spec's empty state replaces the chart and the table only: the
    // InfoCards and the TimingComparisonPanel keep their place with a sentence
    // where their values were, so neither the heading nor the reading order
    // moves under the reader.
    expect(text('ft-spread-placeholder')).toContain('valuation band');
    expect(text('ft-comparison-placeholder')).toContain('information ratios');
    expect(headings('h2')).toEqual([
      'Factor timing controls',
      'Regime & market state',
      'Value spread',
      'Timing comparison — information ratio, out of sample',
    ]);
  });

  it('when the computation fails, the page below the toolbar is one error with a retry', async () => {
    await service.refresh(true);
    fixture.detectChanges();

    expect(text('ft-load-error')).toContain('could not be computed');
    expect(host.querySelector('[data-testid="ft-load-error"] [role]')?.getAttribute('role')).toBe(
      'status',
    );
    expect(host.querySelector('app-factor-timing-signal-table')).toBeNull();
    expect(
      host.querySelector('[data-testid="ft-apply"]')?.getAttribute('aria-disabled'),
    ).toBe('true');

    // The retry starts a run this fixture does not hold a handle on, so the
    // wait is on the clock rather than on `settled()`.
    (host.querySelector('[data-testid="ft-load-error"] button') as HTMLElement).click();
    await new Promise((resolve) => setTimeout(resolve, 800));
    fixture.detectChanges();

    expect(host.querySelector('[data-testid="ft-load-error"]')).toBeNull();
    expect(host.querySelector('app-factor-timing-signal-table')).toBeTruthy();
  });
});
