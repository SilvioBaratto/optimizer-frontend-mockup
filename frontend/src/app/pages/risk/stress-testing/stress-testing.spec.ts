/**
 * The page as a whole: the seven regions in reading order, the tab that swaps
 * four of them, the four states, and the rule the doc puts above everything
 * else — a toolbar parameter that moves marks results stale, in words, and
 * recomputes nothing.
 *
 * Only the chart *panel* is stubbed — ECharts wants a canvas and a
 * `ResizeObserver`, and jsdom has neither. Both `BarChartComponent`s are the
 * real ones, so the categories, the series, the value formatter, the accessible
 * label and the `[table]` the panel would render as the "View as table"
 * alternative are all built by production code and asserted as the reader would
 * get them.
 */

import { Component, input, signal } from '@angular/core';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import type { EChartsCoreOption } from 'echarts/core';

import { STALE_RESULT_BADGE } from '../../../models/stress-testing.model';
import { StressTestingService } from '../../../services/stress-testing.service';
import { BarChartComponent, ChartPanelComponent } from '../../../shared/charts';
import type { ChartTable } from '../../../shared/charts';
import { StressTesting } from './stress-testing';

/** Everything `app-chart-panel` gives a reader, minus the canvas. */
@Component({
  selector: 'app-chart-panel',
  template: `
    <figure>
      <figcaption>
        <h3>{{ title() }}</h3>
        <p>{{ subtitle() }}</p>
        @if (table()) {
          <button type="button" [attr.aria-pressed]="showTable()" (click)="toggle()">
            {{ showTable() ? 'View as chart' : 'View as table' }}
          </button>
        }
      </figcaption>
      <div data-testid="chart-figure" role="img" [attr.aria-label]="ariaLabel() || title()">
        @if (showTable() && table(); as data) {
          <table data-testid="chart-table">
            <tbody>
              @for (row of data.rows; track $index) {
                <tr>
                  @for (cell of row; track $index) {
                    <td>{{ cell }}</td>
                  }
                </tr>
              }
            </tbody>
          </table>
        }
      </div>
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

  protected readonly showTable = signal(false);

  protected toggle(): void {
    this.showTable.set(!this.showTable());
  }
}

/**
 * jsdom has no `ResizeObserver`, and `ChartBase` installs one after the first
 * render so a chart can cap its height on a narrow container. The stub observes
 * nothing, which is the right answer in an environment with no layout.
 */
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

/** The service's stand-in latency is 700ms; this outlasts it. */
function settle(ms = 800): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

describe('StressTesting page', () => {
  let fixture: ComponentFixture<StressTesting>;
  let host: HTMLElement;
  let service: StressTestingService;

  beforeAll(() => {
    installResizeObserver();
  });

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [StressTesting],
      providers: [provideRouter([])],
    })
      .overrideComponent(BarChartComponent, {
        remove: { imports: [ChartPanelComponent] },
        add: { imports: [ChartPanelStub] },
      })
      .compileComponents();

    fixture = TestBed.createComponent(StressTesting);
    host = fixture.nativeElement;
    service = TestBed.inject(StressTestingService);
    document.body.appendChild(host);
    fixture.detectChanges();
  });

  afterEach(() => {
    host.remove();
  });

  function byTestId(id: string): HTMLElement | null {
    return host.querySelector(`[data-testid="${id}"]`);
  }

  function tab(mode: string): HTMLButtonElement {
    return host.querySelector(`[data-tab="${mode}"]`) as HTMLButtonElement;
  }

  function text(id: string): string {
    return byTestId(id)?.textContent?.trim() ?? '';
  }

  async function runWorstCase(): Promise<void> {
    (byTestId('run-worst-case') as HTMLButtonElement).click();
    fixture.detectChanges();
    await settle();
    fixture.detectChanges();
  }

  // --- regions ---------------------------------------------------------------

  it('when the page renders, the forward regions appear in the spec’s order', () => {
    const markers = [
      '#st-impact-measure',
      '[role="tablist"]',
      '#st-factors-heading',
      'app-stress-scenario-summary',
      'app-stress-severity-chart',
      'app-stress-loss-contributions',
      '#st-library-heading',
    ].map((selector) => host.querySelector(selector));

    expect(markers.every((element) => element !== null)).toBe(true);

    const positions = markers.map((element) =>
      Array.prototype.indexOf.call(host.querySelectorAll('*'), element),
    );
    expect(positions).toEqual([...positions].sort((a, b) => a - b));
  });

  it('when the page renders, a skip link jumps past the toolbar to the exercise', () => {
    expect(host.querySelector('a.skip-link')?.getAttribute('href')).toBe(
      '#stress-testing-content',
    );
    expect(host.querySelector('#stress-testing-content')).not.toBeNull();
  });

  it('when the page renders, headings start at h2 and skip no level on the way down', () => {
    const levels = Array.from(host.querySelectorAll('h1,h2,h3,h4,h5,h6')).map((heading) =>
      Number(heading.tagName.slice(1)),
    );

    expect(levels.length).toBeGreaterThan(0);
    expect(Math.min(...levels)).toBe(2);
    expect(levels).not.toContain(1);
    const jumps = levels.filter((level, i) => i > 0 && level > levels[i - 1] + 1);
    expect(jumps).toEqual([]);
  });

  // --- the TabBar ------------------------------------------------------------

  it('when the page opens, the forward tab is selected and is the only tab stop', () => {
    expect(host.querySelector('[role="tablist"]')?.getAttribute('aria-label')).toBe(
      'Stress test mode',
    );
    expect(tab('forward').getAttribute('aria-selected')).toBe('true');
    expect(tab('forward').getAttribute('tabindex')).toBe('0');
    expect(tab('reverse').getAttribute('aria-selected')).toBe('false');
    expect(tab('reverse').getAttribute('tabindex')).toBe('-1');
    expect(host.querySelector('[role="tabpanel"]')?.getAttribute('aria-labelledby')).toBe(
      'st-tab-forward',
    );
  });

  it('when either tab is read, its aria-controls resolves to the panel that is on screen', () => {
    for (const mode of ['forward', 'reverse']) {
      const controls = tab(mode).getAttribute('aria-controls');
      expect(controls, mode).toBeTruthy();
      expect(host.querySelector(`#${controls}`), mode).toBe(
        host.querySelector('[role="tabpanel"]'),
      );
    }
  });

  it('when the reverse tab is chosen, it replaces the table, the cards and both figures', () => {
    tab('reverse').click();
    fixture.detectChanges();

    expect(host.querySelector('#st-factors-heading')).toBeNull();
    expect(host.querySelector('app-stress-scenario-summary')).toBeNull();
    expect(host.querySelector('app-stress-severity-chart')).toBeNull();
    expect(host.querySelector('app-stress-loss-contributions')).toBeNull();
    expect(host.querySelector('#st-reverse-heading')).not.toBeNull();
  });

  it('when the reverse tab is chosen, the toolbar and the library stay put and stay shared', () => {
    tab('reverse').click();
    fixture.detectChanges();

    expect(host.querySelector('#st-impact-measure')).not.toBeNull();
    expect(byTestId('run-worst-case')).not.toBeNull();
    expect(byTestId('save-scenario')).not.toBeNull();
    expect(text('k-readout')).toBe('5.00');
    expect(host.querySelector('#st-library-heading')).not.toBeNull();
    expect(host.querySelectorAll('[data-scenario]')).toHaveLength(4);
  });

  it('when ArrowRight is pressed on the active tab, the next tab is selected and focused', () => {
    tab('forward').focus();
    tab('forward').dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowRight' }));
    fixture.detectChanges();

    expect(service.mode()).toBe('reverse');
    expect(tab('reverse').getAttribute('aria-selected')).toBe('true');
    expect(document.activeElement).toBe(tab('reverse'));
  });

  it('when ArrowLeft is pressed on the first tab, selection wraps to the last', () => {
    tab('forward').dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowLeft' }));
    fixture.detectChanges();

    expect(service.mode()).toBe('reverse');
  });

  it('when End and then Home are pressed, the ends of the tablist are reached', () => {
    tab('forward').dispatchEvent(new KeyboardEvent('keydown', { key: 'End' }));
    fixture.detectChanges();
    expect(service.mode()).toBe('reverse');

    tab('reverse').dispatchEvent(new KeyboardEvent('keydown', { key: 'Home' }));
    fixture.detectChanges();
    expect(service.mode()).toBe('forward');
  });

  it('when a key the tablist does not own is pressed, the tab does not move', () => {
    tab('forward').dispatchEvent(new KeyboardEvent('keydown', { key: 'a' }));
    fixture.detectChanges();

    expect(service.mode()).toBe('forward');
  });

  // --- the page's central rule ----------------------------------------------

  it('when k moves after a search, every result is badged stale and no figure changes', async () => {
    await runWorstCase();
    const cep = text('worst-case-cep');
    const loss = text('worst-case-loss');
    expect(cep).toBe('−2.4% RWA');
    expect(loss).toBe('−6.6 pts');

    const field = host.querySelector('#st-k') as HTMLInputElement;
    field.value = '8';
    field.dispatchEvent(new Event('change'));
    fixture.detectChanges();

    expect(text('k-readout')).toBe('8.00');
    // Not one number moved, and the card still names the radius it was run at.
    expect(text('worst-case-cep')).toBe(cep);
    expect(text('worst-case-loss')).toBe(loss);
    expect(byTestId('worst-case-stale')?.textContent).toContain(STALE_RESULT_BADGE);
    expect(byTestId('expected-stale')?.textContent).toContain(STALE_RESULT_BADGE);
    expect(byTestId('toolbar-stale-note')).not.toBeNull();
    expect(host.querySelector('app-stress-scenario-summary')?.textContent).toContain(
      'Computed at k = 5.00',
    );
  });

  it('when the impact measure moves after a search, the figures keep the unit they were computed in', async () => {
    await runWorstCase();

    const select = host.querySelector('#st-impact-measure') as HTMLSelectElement;
    select.value = 'asset-values';
    select.dispatchEvent(new Event('change'));
    fixture.detectChanges();

    expect(text('measure-unit')).toContain('% NAV');
    expect(text('worst-case-cep')).toBe('−2.4% RWA');
    expect(text('expected-cep')).toBe('+4.2% RWA');
    expect(byTestId('worst-case-stale')?.textContent).toContain(STALE_RESULT_BADGE);
  });

  it('when the search is re-run at the new radius, the badge clears and the figures move', async () => {
    await runWorstCase();
    const field = host.querySelector('#st-k') as HTMLInputElement;
    field.value = '6';
    field.dispatchEvent(new Event('change'));
    fixture.detectChanges();

    await runWorstCase();

    expect(byTestId('worst-case-stale')).toBeNull();
    expect(text('worst-case-maha')).toContain('6.00');
    expect(text('worst-case-cep')).not.toBe('−2.4% RWA');
  });

  // --- the four states -------------------------------------------------------

  it('when nothing has been run, the cards are placeholders and both figures are empty', () => {
    expect(byTestId('manual-placeholder')).not.toBeNull();
    expect(byTestId('worst-case-placeholder')).not.toBeNull();
    expect(host.querySelector('app-stress-severity-chart')?.textContent).toContain(
      'No scenario evaluated yet.',
    );
    expect(host.querySelector('app-stress-loss-contributions')?.textContent).toContain(
      'No maximum-loss contributions yet.',
    );
    // The expected scenario is always there — it is what the losses are against.
    expect(text('expected-cep')).toBe('+4.2% RWA');
  });

  it('while the search runs, the affected card and both figures show placeholders', async () => {
    (byTestId('run-worst-case') as HTMLButtonElement).click();
    fixture.detectChanges();

    expect(byTestId('worst-case-skeleton')?.getAttribute('aria-busy')).toBe('true');
    expect(byTestId('severity-skeleton')).not.toBeNull();
    expect(byTestId('mlc-skeleton')).not.toBeNull();
    expect(byTestId('run-worst-case')?.getAttribute('aria-disabled')).toBe('true');
    expect(byTestId('run-worst-case')?.getAttribute('aria-busy')).toBe('true');

    await settle();
    fixture.detectChanges();
    expect(byTestId('worst-case-skeleton')).toBeNull();
  });

  it('when the fixed factors already sit outside Ell_k, an inline alert says so above the cards', async () => {
    const fix = host.querySelector('[data-fix="equity"]') as HTMLInputElement;
    fix.checked = true;
    fix.dispatchEvent(new Event('change'));
    fixture.detectChanges();

    const value = host.querySelector('[data-value="equity"]') as HTMLInputElement;
    value.value = '-18';
    value.dispatchEvent(new Event('change'));
    fixture.detectChanges();

    await runWorstCase();

    const alert = host.querySelector('[role="alert"]');
    expect(alert?.textContent).toContain('Search did not converge within Ell_k.');
    expect(alert?.textContent).toContain('Reduce the fixed constraints or raise the plausibility');
    expect(alert?.querySelector('button')?.textContent).toContain('Retry');
    // The alert sits above the cards it concerns.
    const all = Array.from(host.querySelectorAll('*'));
    expect(all.indexOf(alert!)).toBeLessThan(
      all.indexOf(host.querySelector('app-stress-scenario-summary')!),
    );
  });

  it('when the failed search is retried, focus leaves the alert before it is destroyed', async () => {
    await service.runWorstCase(true);
    fixture.detectChanges();

    const retry = host.querySelector('[role="alert"] button') as HTMLButtonElement;
    retry.focus();
    retry.click();
    fixture.detectChanges();

    expect(document.activeElement).toBe(host.querySelector('#stress-testing-content'));

    await settle();
    fixture.detectChanges();
    expect(host.querySelector('[role="alert"]')).toBeNull();
    expect(text('worst-case-cep')).toBe('−2.4% RWA');
  });

  it('when a search runs from the reverse tab, the page shows the panels it populated', async () => {
    tab('reverse').click();
    fixture.detectChanges();

    await runWorstCase();

    expect(service.mode()).toBe('forward');
    expect(text('worst-case-cep')).toBe('−2.4% RWA');
  });

  // --- exits ------------------------------------------------------------------

  it('when the page renders, it exits to the two pages the spec names as entries', () => {
    const hrefs = Array.from(host.querySelectorAll('a')).map((a) => a.getAttribute('href'));
    expect(hrefs).toContain('/risk/risk-monitoring');
    expect(hrefs).toContain('/risk/risk-attribution');
  });
});
