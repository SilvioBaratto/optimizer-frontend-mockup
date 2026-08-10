/**
 * The page as a whole: fourteen regions across three tabs, what the tab bar
 * replaces and what it leaves standing, the four states, and the rule the doc
 * puts above everything else — selecting a card and including a card are
 * different acts.
 *
 * Only the chart *panel* is stubbed — ECharts wants a canvas and a
 * `ResizeObserver`, and jsdom has neither. Every chart component is the real
 * one, so the categories, the series, the accessible label and the table
 * alternative are built by production code.
 */

import { Component, input, signal } from '@angular/core';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import type { EChartsCoreOption } from 'echarts/core';

import { AltDataSentimentService } from '../../../services/alt-data-sentiment.service';
import { BarChartComponent, ChartPanelComponent } from '../../../shared/charts';
import type { ChartTable } from '../../../shared/charts';
import { AlternativeDataSentiment } from './alternative-data-sentiment';

@Component({
  selector: 'app-chart-panel',
  template: `
    <figure>
      <figcaption>
        <h3>{{ title() }}</h3>
        <p data-testid="chart-subtitle">{{ subtitle() }}</p>
      </figcaption>
      <div data-testid="chart-figure" role="img" [attr.aria-label]="ariaLabel() || title()"></div>
      <ng-content />
    </figure>
  `,
})
class ChartPanelStub {
  readonly title = input('');
  readonly subtitle = input('');
  readonly ariaLabel = input('');
  readonly options = input.required<EChartsCoreOption>();
  readonly loading = input(false);
  readonly height = input(320);
  readonly table = input<ChartTable | null>(null);

  protected readonly unused = signal(false);
}

function installResizeObserver(): void {
  if ('ResizeObserver' in globalThis) return;
  (globalThis as unknown as Record<string, unknown>)['ResizeObserver'] = class {
    observe(): void {
      /* no layout to observe */
    }
    unobserve(): void {
      /* no layout to observe */
    }
    disconnect(): void {
      /* no layout to observe */
    }
  };
}

/** The service's panel read is 300ms and its page read 600ms. */
function settle(ms = 700): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

describe('AlternativeDataSentiment page', () => {
  let fixture: ComponentFixture<AlternativeDataSentiment>;
  let host: HTMLElement;
  let service: AltDataSentimentService;

  beforeAll(() => {
    installResizeObserver();
  });

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [AlternativeDataSentiment],
      providers: [provideRouter([])],
    })
      .overrideComponent(BarChartComponent, {
        remove: { imports: [ChartPanelComponent] },
        add: { imports: [ChartPanelStub] },
      })
      .compileComponents();

    fixture = TestBed.createComponent(AlternativeDataSentiment);
    host = fixture.nativeElement;
    service = TestBed.inject(AltDataSentimentService);
    document.body.appendChild(host);
    fixture.detectChanges();
  });

  afterEach(() => {
    host.remove();
  });

  function tab(id: string): HTMLButtonElement {
    return host.querySelector(`[data-tab="${id}"][role="tab"]`) as HTMLButtonElement;
  }

  async function openTab(id: string): Promise<void> {
    tab(id).click();
    fixture.detectChanges();
    await service.settled();
    fixture.detectChanges();
  }

  // --- the regions that never move -------------------------------------------

  it('when the page renders, the fourteen regions open on the signal library', () => {
    expect(host.querySelector('app-alt-data-scope-bar')).not.toBeNull();
    expect(host.querySelector('app-alt-data-diagnostic-legend')).not.toBeNull();
    expect(host.querySelectorAll('[role="tab"]')).toHaveLength(3);
    expect(host.querySelector('app-alt-data-signal-library')).not.toBeNull();
    expect(host.querySelector('app-alt-data-signal-detail')).not.toBeNull();
    expect(host.querySelector('app-alt-data-selection-footer')).not.toBeNull();
    expect(tab('signal-library').getAttribute('aria-selected')).toBe('true');
  });

  it('when the page starts, a skip link leads past the scope controls to the signals', () => {
    const skip = host.querySelector('a.skip-link') as HTMLAnchorElement;
    expect(skip.getAttribute('href')).toBe('#ads-content');
    expect(host.querySelector('#ads-content')?.getAttribute('role')).toBe('tabpanel');
  });

  it('when the page renders, it starts at h2 because the shell owns the h1', () => {
    expect(host.querySelector('h1')).toBeNull();
    expect(host.querySelector('h2')).not.toBeNull();
  });

  // --- what the tabs replace, and what they do not ---------------------------

  it('when the Cross-Sectional tab is opened, it replaces the grid and the detail panel', async () => {
    await openTab('cross-sectional');

    expect(host.querySelector('app-alt-data-signal-library')).toBeNull();
    expect(host.querySelector('app-alt-data-signal-detail')).toBeNull();
    expect(host.querySelector('app-alt-data-cross-sectional-panel')).not.toBeNull();
  });

  it('when the ML tab is opened, it replaces them with the parameter panel and the table', async () => {
    await openTab('ml-aggregation');

    expect(host.querySelector('app-alt-data-signal-library')).toBeNull();
    expect(host.querySelector('app-alt-data-ml-aggregation-panel')).not.toBeNull();
    expect(host.querySelectorAll('[data-model]')).toHaveLength(7);
  });

  it('when a tab is switched, the scope bar, the tab bar and the footer stay put', async () => {
    await openTab('ml-aggregation');

    expect(host.querySelector('app-alt-data-scope-bar')).not.toBeNull();
    expect(host.querySelectorAll('[role="tab"]')).toHaveLength(3);
    expect(host.querySelector('app-alt-data-selection-footer')).not.toBeNull();
  });

  it('when a tab is switched, the panel loads before it shows anything', async () => {
    tab('cross-sectional').click();
    fixture.detectChanges();

    expect(host.querySelector('[data-testid="ads-loading"]')?.getAttribute('aria-busy')).toBe(
      'true',
    );
    expect(host.querySelector('app-alt-data-cross-sectional-panel')).toBeNull();

    await service.settled();
    fixture.detectChanges();

    expect(host.querySelector('[data-testid="ads-loading"]')).toBeNull();
    expect(host.querySelector('app-alt-data-cross-sectional-panel')).not.toBeNull();
  });

  it('when a tab is switched, the selection made in the library survives it', async () => {
    service.toggleInclude('social-mood');
    await openTab('ml-aggregation');

    expect(host.querySelector('[data-testid="ads-selection-count"]')?.textContent).toContain(
      '4 of 6',
    );
  });

  // --- the tablist keyboard contract -----------------------------------------

  it('when the tablist is arrowed through, only the active tab is in the tab order', async () => {
    expect(tab('signal-library').getAttribute('tabindex')).toBe('0');
    expect(tab('cross-sectional').getAttribute('tabindex')).toBe('-1');

    tab('signal-library').dispatchEvent(
      new KeyboardEvent('keydown', { key: 'ArrowRight', bubbles: true }),
    );
    fixture.detectChanges();
    await service.settled();
    fixture.detectChanges();

    expect(service.tab()).toBe('cross-sectional');
    expect(tab('cross-sectional').getAttribute('tabindex')).toBe('0');
    expect(document.activeElement).toBe(tab('cross-sectional'));
  });

  it('when the panel is labelled, it names the tab that selects it', () => {
    expect(host.querySelector('#ads-content')?.getAttribute('aria-labelledby')).toBe(
      'ads-tab-signal-library',
    );
  });

  // --- selection is not inclusion, end to end --------------------------------

  it('when Enter activates a card, the detail panel follows it and focus lands on its heading', async () => {
    const card = host.querySelector('[data-signal="media-pessimism"]') as HTMLElement;
    card.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true }));
    fixture.detectChanges();
    await Promise.resolve();
    fixture.detectChanges();

    expect(host.querySelector('[data-testid="ads-detail-verdict"]')?.textContent).toContain(
      'given back over days 2 to 5',
    );
    expect(document.activeElement).toBe(host.querySelector('#ads-detail-heading'));
  });

  it('when Space includes a card, the footer counts it and the detail panel does not move', () => {
    const card = host.querySelector('[data-signal="social-mood"]') as HTMLElement;
    card.dispatchEvent(new KeyboardEvent('keydown', { key: ' ', bubbles: true }));
    fixture.detectChanges();

    expect(host.querySelector('[data-testid="ads-selection-count"]')?.textContent).toContain(
      '4 of 6',
    );
    expect(host.querySelector('[data-signal="tenk-tone"]')?.getAttribute('aria-selected')).toBe(
      'true',
    );
  });

  it('when the detail panel opens the next tab, focus follows instead of falling to the body', async () => {
    const card = host.querySelector('[data-signal="aggregate-sentiment"]') as HTMLElement;
    card.click();
    fixture.detectChanges();

    const bridge = host.querySelector(
      '[data-testid="ads-open-cross-sectional"]',
    ) as HTMLButtonElement;
    bridge.focus();
    bridge.click();
    fixture.detectChanges();
    await service.settled();
    fixture.detectChanges();

    expect(service.tab()).toBe('cross-sectional');
    // The button that was pressed no longer exists — the panel it lived in was
    // replaced — so focus has to have been put somewhere deliberately.
    expect(document.activeElement).toBe(tab('cross-sectional'));
  });

  it('when the figure panel renders, its heading does not repeat the chart title', () => {
    const panelHeading = host.querySelector('#ads-detail-heading')?.textContent?.trim() ?? '';
    const chartTitle =
      host.querySelector('[data-testid="chart-figure"]')?.getAttribute('aria-label') ?? '';

    expect(panelHeading).toBe('Evidence for 10-K Tone (Fin-Neg/H4N)');
    expect(chartTitle).toContain('Abnormal return around the filing date');
    expect(chartTitle).not.toContain(panelHeading);
  });

  // --- the states ------------------------------------------------------------

  it('when the scope is being re-read, placeholders stand in at the panel heights', async () => {
    service.setUniverse('us-large-cap');
    fixture.detectChanges();

    const loading = host.querySelector('[data-testid="ads-loading"]');
    expect(loading?.getAttribute('aria-busy')).toBe('true');
    expect(loading?.querySelectorAll('app-skeleton-block')).toHaveLength(3);
    expect(host.querySelector('[role="listbox"]')).toBeNull();

    await service.settled();
    fixture.detectChanges();
    expect(host.querySelector('[role="listbox"]')).not.toBeNull();
  });

  it('when the read fails, the error replaces the grid and offers the same read again', async () => {
    await service.refresh(true);
    fixture.detectChanges();

    const error = host.querySelector('[data-testid="ads-load-error"]');
    expect(error?.textContent).toContain('could not be loaded');
    expect(error?.querySelector('[role="status"]')).not.toBeNull();
    expect(host.querySelector('[role="listbox"]')).toBeNull();

    (error?.querySelector('button') as HTMLButtonElement).click();
    await settle();
    fixture.detectChanges();

    expect(host.querySelector('[data-testid="ads-load-error"]')).toBeNull();
    expect(host.querySelector('[role="listbox"]')).not.toBeNull();
  });

  it('when the universe has no feed, the grid explains it and the footer stays', async () => {
    service.setUniverse('em-frontier-small');
    await service.settled();
    fixture.detectChanges();

    expect(host.querySelector('[data-testid="ads-empty-universe"]')).not.toBeNull();
    expect(host.querySelector('app-alt-data-selection-footer')).not.toBeNull();
  });

  // --- the exits -------------------------------------------------------------

  it('when the page ends, it offers the entries the spec names as exits', () => {
    const links = Array.from(host.querySelectorAll('app-cross-page-link a')).map((link) =>
      link.getAttribute('href'),
    );
    expect(links).toContain('/build/signals-factors');
    expect(links).toContain('/advanced-signals/market-regimes');
  });
});
