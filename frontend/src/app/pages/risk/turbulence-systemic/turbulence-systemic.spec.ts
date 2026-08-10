/**
 * The page as a whole: the fifteen regions in reading order, the four states,
 * and the three behaviours that belong to the page rather than to a region —
 * the in-page jumps, the isolation of a failed panel from its neighbours, and
 * the deferral of the below-the-fold figures.
 *
 * Charts are stubbed wherever they are reached: ECharts wants a canvas and
 * jsdom has none. The stubs render what they were handed — the accessible
 * label, the title, the reference marks — so the assertions are still about
 * what a reader gets rather than about a signal a component owns.
 *
 * Defer blocks run in `Manual` mode so both halves are observable: the
 * placeholder that holds the layout open, and the panel that replaces it.
 */

import { Component, computed, input } from '@angular/core';
import {
  ComponentFixture,
  DeferBlockBehavior,
  DeferBlockState,
  TestBed,
} from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { vi } from 'vitest';

import type { BulletRow, CategorySeries, RefPoint, ValueFormatter } from '../../../shared/charts';
import { BulletChartComponent, LineChartComponent } from '../../../shared/charts';
import { TurbulenceService } from '../../../services/turbulence.service';
import { AbsorptionChart } from './absorption-chart/absorption-chart';
import { PairwiseInspector } from './pairwise-inspector/pairwise-inspector';
import { TurbulenceChart } from './turbulence-chart/turbulence-chart';
import { TurbulenceSystemic } from './turbulence-systemic';

@Component({
  selector: 'app-line-chart',
  template: `
    <div [attr.data-aria-label]="ariaLabel()" [attr.data-chart-title]="title()">
      <span data-testid="chart-series">{{ names() }}</span>
      <span data-testid="chart-refs">{{ refs() }}</span>
      <ng-content />
    </div>
  `,
})
class LineChartStub {
  readonly title = input('');
  readonly subtitle = input('');
  readonly ariaLabel = input('');
  readonly x = input.required<readonly (string | number)[]>();
  readonly series = input.required<readonly CategorySeries[]>();
  readonly refLines = input<readonly unknown[]>([]);
  readonly refBands = input<readonly unknown[]>([]);
  readonly refPoints = input<readonly RefPoint[]>([]);
  readonly valueFormatter = input<ValueFormatter>((value) => String(value));
  readonly xAxisName = input('');
  readonly yAxisName = input('');
  readonly height = input(320);

  protected readonly names = computed(() =>
    this.series()
      .map((s) => s.name)
      .join(' | '),
  );
  protected readonly refs = computed(() =>
    this.refPoints()
      .map((point) => point.label ?? '')
      .join(' | '),
  );
}

@Component({
  selector: 'app-bullet-chart',
  template: `
    <div [attr.data-aria-label]="ariaLabel()" [attr.data-chart-title]="title()">
      <ng-content />
    </div>
  `,
})
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
}

describe('TurbulenceSystemic page', () => {
  let fixture: ComponentFixture<TurbulenceSystemic>;
  let host: HTMLElement;
  let service: TurbulenceService;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [TurbulenceSystemic],
      providers: [provideRouter([])],
      deferBlockBehavior: DeferBlockBehavior.Manual,
    })
      .overrideComponent(TurbulenceChart, {
        remove: { imports: [LineChartComponent] },
        add: { imports: [LineChartStub] },
      })
      .overrideComponent(AbsorptionChart, {
        remove: { imports: [LineChartComponent] },
        add: { imports: [LineChartStub] },
      })
      .overrideComponent(PairwiseInspector, {
        remove: { imports: [BulletChartComponent] },
        add: { imports: [BulletChartStub] },
      })
      .compileComponents();

    fixture = TestBed.createComponent(TurbulenceSystemic);
    host = fixture.nativeElement;
    service = TestBed.inject(TurbulenceService);
    document.body.appendChild(host);
    fixture.detectChanges();
  });

  afterEach(() => {
    vi.restoreAllMocks();
    host.remove();
  });

  function text(): string {
    return host.textContent ?? '';
  }

  function testId(id: string): HTMLElement | null {
    return host.querySelector(`[data-testid="${id}"]`);
  }

  /** Waits out the service's stand-in latency, which is a real timer. */
  async function settle(): Promise<void> {
    for (let attempt = 0; attempt < 60 && service.state() === 'loading'; attempt++) {
      await new Promise((resolve) => setTimeout(resolve, 25));
    }
    await fixture.whenStable();
  }

  // --- reading order ---------------------------------------------------------

  it('when the page renders, the fifteen regions appear in the order the wireframe draws them', () => {
    const order = [
      'app-turbulence-snapshot-bar',
      'app-turbulence-indicator-grid',
      'app-turbulence-section-nav',
      'app-turbulence-display-toolbar',
      'app-turbulence-chart',
      'app-turbulence-pairwise-inspector',
      'app-turbulence-contributors-table',
      'app-turbulence-pc1-contribution-table',
      'app-info-card',
    ];
    const rendered = Array.from(host.querySelectorAll(order.join(','))).map((element) =>
      element.tagName.toLowerCase(),
    );
    expect(rendered).toEqual(order);
  });

  it('when the page renders, its own outline starts at h2 with no skipped level', () => {
    expect(host.querySelector('h1')).toBeNull();
    const headings = Array.from(host.querySelectorAll('h2, h3')).map((h) => h.tagName);
    expect(headings[0]).toBe('H2');
    expect(new Set(headings)).toEqual(new Set(['H2', 'H3']));
  });

  it('when the page renders, the four jump targets exist as sections', () => {
    for (const id of [
      'section-turbulence',
      'section-compactness',
      'section-pc1-growth',
      'section-correlation-structure',
    ]) {
      expect(host.querySelector(`#${id}`)).not.toBeNull();
    }
  });

  // --- SectionNav ------------------------------------------------------------

  it('when a jump link is activated from the keyboard, focus moves to its section without reloading', () => {
    const asOfBefore = service.snapshot().asOf;
    const link = testId('jump-compactness') as HTMLAnchorElement;
    expect(link.getAttribute('href')).toBe('#section-compactness');

    // A real anchor turns Enter into a click; this is that click.
    link.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true }));
    fixture.detectChanges();

    expect(document.activeElement).toBe(host.querySelector('#section-compactness'));
    expect(service.snapshot().asOf).toBe(asOfBefore);
    expect(service.state()).toBe('ready');
  });

  it('when a jump lands on a section, its scroll margin clears the bar pinned above it', () => {
    // The bar is 111px at 1440, 155px at 1024 and 225px at 768, so no single
    // `scroll-mt-*` clears it; the page measures. jsdom applies no stylesheet,
    // so the pinned bar is described here directly.
    //
    // The mock has to describe the element that really carries the sticky —
    // `app-page-context-bar`. `app-turbulence-snapshot-bar` is `display:
    // contents`: it generates no box, so `position` reads `static` and the
    // height is 0. Mocking *that* is how this test went on passing while the
    // measurement returned 0 at every width in a browser.
    const bar = host.querySelector('app-page-context-bar') as HTMLElement;
    const target = host.querySelector('#section-pc1-growth') as HTMLElement;
    // jsdom ships no `scrollIntoView`, and the page skips the scroll without it.
    target.scrollIntoView = vi.fn();
    const real = window.getComputedStyle.bind(window);
    vi.spyOn(window, 'getComputedStyle').mockImplementation(((element: Element) =>
      element === bar
        ? ({ position: 'sticky' } as CSSStyleDeclaration)
        : real(element)) as typeof window.getComputedStyle);
    vi.spyOn(bar, 'getBoundingClientRect').mockReturnValue({ height: 225 } as DOMRect);

    (testId('jump-pc1-growth') as HTMLAnchorElement).dispatchEvent(
      new MouseEvent('click', { bubbles: true, cancelable: true }),
    );
    fixture.detectChanges();

    expect(target.scrollIntoView).toHaveBeenCalled();
    expect(Number.parseInt(target.style.scrollMarginTop, 10)).toBeGreaterThan(225);
  });

  it('when the bar above the section is not pinned, the jump allows only the reading gap', () => {
    // Below `md` the bar is in normal flow, and the topbar it used to sit
    // under is the scrollport's `scroll-padding-top` — counted once, there,
    // never again here. jsdom reports every element `static`, which is that
    // case: the allowance collapses to the gap rather than double-counting
    // chrome the scrollport has already reserved.
    const target = host.querySelector('#section-compactness') as HTMLElement;
    target.scrollIntoView = vi.fn();

    (testId('jump-compactness') as HTMLAnchorElement).dispatchEvent(
      new MouseEvent('click', { bubbles: true, cancelable: true }),
    );
    fixture.detectChanges();

    expect(target.style.scrollMarginTop).toBe('16px');
  });

  // --- the deferred figures --------------------------------------------------

  it('when the page first renders, the below-the-fold figures are placeholders of their own height', async () => {
    expect(host.querySelector('app-turbulence-absorption-chart')).toBeNull();
    const blocks = await fixture.getDeferBlocks();
    expect(blocks.length).toBe(5);

    // One placeholder per block, and each is the panel's own loading card — so
    // the height it holds open is written once, beside the panel, and the
    // "not downloaded yet" box cannot be a different height from the
    // "recomputing" box and jolt the page between them.
    // The pixel heights are measured from the rendered panels, not guessed: a
    // spacing-scale class was 100-400px short of every one of them.
    const heights: Record<string, string> = {
      absorption: 'h-[520px] lg:h-[390px]',
      'effective-rank': 'h-[464px] lg:h-[366px]',
      'pc1-growth': 'h-[878px] lg:h-[798px]',
      spectrum: 'h-[852px] lg:h-[722px]',
      participation: 'h-[476px] lg:h-[394px]',
    };
    for (const [panel, height] of Object.entries(heights)) {
      const placeholder = testId(`panel-loading-${panel}`);
      expect(placeholder).not.toBeNull();
      expect(placeholder?.getAttribute('aria-busy')).toBe('true');
      const bars = Array.from(placeholder?.querySelectorAll('app-skeleton-block div div') ?? []);
      expect(bars.some((bar) => bar.className.includes(height))).toBe(true);
    }
  });

  it('when a deferred block resolves, its panel replaces the placeholder in the same slot', async () => {
    const blocks = await fixture.getDeferBlocks();
    await blocks[0].render(DeferBlockState.Complete);
    fixture.detectChanges();

    expect(host.querySelector('app-turbulence-absorption-chart')).not.toBeNull();
    expect(text()).toContain('Absorption ratio');
  });

  // --- states ----------------------------------------------------------------

  it('when no universe is selected, the page is empty with the window it needs named and a way out', () => {
    service.selectUniverse(null);
    fixture.detectChanges();

    expect(text()).toContain('No universe selected');
    expect(host.querySelector('app-empty-state')).not.toBeNull();
    expect(host.querySelector('app-turbulence-chart')).toBeNull();
    expect(host.querySelector('a[href="/build/universe-data"]')).not.toBeNull();
    // The bar stays: it already says which universe is selected.
    expect(host.querySelector('app-turbulence-snapshot-bar')).not.toBeNull();
  });

  it('when the universe is younger than the estimation windows, the empty state names both windows', () => {
    service.selectUniverse('new-universe');
    fixture.detectChanges();

    expect(text()).toContain('Not enough history to compute the indicators');
    expect(text()).toContain('500 days');
    expect(text()).toContain('100 observations');
  });

  it('when every panel is recomputing, each region keeps its place and shows its own placeholder', async () => {
    const run = service.refresh();
    fixture.detectChanges();

    // The grid empties into six card-sized blocks rather than its figures…
    expect(host.querySelector('[data-testid="indicator-value-turbulence"]')).toBeNull();
    expect(
      host.querySelectorAll('app-turbulence-indicator-grid app-skeleton-block').length,
    ).toBe(6);

    // …and every panel stands in for itself at its own height.
    for (const panel of ['turbulence', 'pairwise', 'contributors'] as const) {
      const placeholder = testId(`panel-loading-${panel}`);
      expect(placeholder).not.toBeNull();
      expect(placeholder?.getAttribute('aria-busy')).toBe('true');
    }

    // The controls stay under the reader's hands while the numbers come back.
    expect(host.querySelector('app-turbulence-section-nav')).not.toBeNull();
    expect(host.querySelector('app-turbulence-display-toolbar')).not.toBeNull();

    // One announcement for the whole run, not one per panel.
    expect(host.querySelectorAll('[role="status"]').length).toBe(1);

    await run;
    fixture.detectChanges();
    expect(testId('panel-loading-turbulence')).toBeNull();
    expect(testId('indicator-value-turbulence')).not.toBeNull();
  });

  it('when every panel has failed, the page shows one error and a retry that recomputes all of them', async () => {
    await service.refresh(true);
    fixture.detectChanges();

    expect(text()).toContain('No indicator could be computed for the current window.');
    const banner = host.querySelector('app-error-state div');
    expect(banner?.getAttribute('role')).toBe('status');

    const retry = Array.from(host.querySelectorAll('button')).find((button) =>
      (button.textContent ?? '').includes('Retry'),
    );
    expect(retry).toBeTruthy();
    retry?.click();
    await settle();
    fixture.detectChanges();

    expect(service.panelErrors().length).toBe(0);
    expect(host.querySelector('app-turbulence-chart')).not.toBeNull();
  });

  it('when one panel fails, its neighbours keep their figures and only it shows an error', async () => {
    await service.refreshPanel('contributors', true);
    fixture.detectChanges();

    expect(testId('panel-error-contributors')).not.toBeNull();
    // The turbulence chart beside it still has its data and its label.
    const chart = host.querySelector('app-turbulence-chart [data-aria-label]');
    expect(chart?.getAttribute('data-aria-label')).toContain('Current reading');
    expect(service.panelStatus().turbulence).toBe('ready');
    expect(service.state()).toBe('ready');
  });

  // --- the display range is a display window ---------------------------------

  it('when the display range changes, no estimation window and no current reading moves', () => {
    const before = {
      asOf: service.snapshot().asOf,
      windows: service.windows(),
      turbulence: service.reading().turbulence,
      threshold: service.reading().threshold,
      absorption: service.absorption().absorptionRatio,
      pc1: service.pc1().share,
    };

    for (const range of ['6M', '3Y', '5Y', 'Max'] as const) {
      service.setDisplayRange(range);
      fixture.detectChanges();

      expect(service.state()).not.toBe('loading');
      expect(service.snapshot().asOf).toBe(before.asOf);
      expect(service.windows()).toEqual(before.windows);
      expect(service.reading().turbulence).toBe(before.turbulence);
      expect(service.reading().threshold).toBe(before.threshold);
      expect(service.absorption().absorptionRatio).toBe(before.absorption);
      expect(service.pc1().share).toBe(before.pc1);
    }
  });

  // --- the placement note ----------------------------------------------------

  it('when the page renders, the placement note says what the readings feed and what they do not', () => {
    expect(text()).toContain('About these indicators');
    expect(text()).toContain('feed the regime state');
    expect(text()).toContain('does not re-identify the regimes and does not size the losses');
    expect(host.querySelector('a[href="/fund/macro-agent"]')).not.toBeNull();
  });
});
