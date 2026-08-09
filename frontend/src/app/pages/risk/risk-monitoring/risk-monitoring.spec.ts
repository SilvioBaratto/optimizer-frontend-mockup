/**
 * The page as a whole: the eight regions in reading order, the four states, and
 * the three behaviours that start in one region and land in another — a
 * threshold row marking a chart, a log entry marking an observation, and the α
 * slider moving exactly three things and nothing else.
 *
 * The line chart is stubbed everywhere it appears: ECharts wants a canvas and
 * jsdom has none. The stub renders what it was handed — the accessible label,
 * the ends of each series through the chart's own formatter, and the reference
 * marks — so the assertions below are still about what the reader gets, not
 * about a signal a component owns.
 */

import { Component, computed, input } from '@angular/core';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { vi } from 'vitest';

import type { CategorySeries, RefLine, RefPoint, ValueFormatter } from '../../../shared/charts';
import { LineChartComponent } from '../../../shared/charts';
import { RiskMonitoringService } from '../../../services/risk-monitoring.service';
import { CdarCurve } from './cdar-curve/cdar-curve';
import { RiskMonitoring } from './risk-monitoring';
import { UnderwaterChart } from './underwater-chart/underwater-chart';
import { VarCvarTrend } from './var-cvar-trend/var-cvar-trend';

@Component({
  selector: 'app-line-chart',
  template: `
    <div [attr.data-aria-label]="ariaLabel()" [attr.data-chart-title]="title()">
      <span data-testid="chart-series">{{ summary() }}</span>
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
  readonly refLines = input<readonly RefLine[]>([]);
  readonly refPoints = input<readonly RefPoint[]>([]);
  readonly valueFormatter = input<ValueFormatter>((value) => String(value));
  readonly xAxisName = input('');
  readonly yAxisName = input('');
  readonly height = input(320);
  readonly area = input(false);
  readonly scaleY = input(true);

  /** The ends of each series, spelled with the formatter the panel's table uses. */
  protected readonly summary = computed(() => {
    const format = this.valueFormatter();
    const spell = (value: number | null | undefined) =>
      value === null || value === undefined ? '—' : format(value);
    return this.series()
      .map((s) => `${s.name}: ${spell(s.data[0])} … ${spell(s.data[s.data.length - 1])}`)
      .join(' | ');
  });

  protected readonly refs = computed(() =>
    [...this.refLines(), ...this.refPoints()].map((mark) => mark.label ?? '').join(' | '),
  );
}

describe('RiskMonitoring page', () => {
  let fixture: ComponentFixture<RiskMonitoring>;
  let host: HTMLElement;
  let service: RiskMonitoringService;
  const scrollIntoView = vi.fn();

  beforeEach(async () => {
    Element.prototype.scrollIntoView = scrollIntoView;
    scrollIntoView.mockClear();

    await TestBed.configureTestingModule({
      imports: [RiskMonitoring],
      providers: [provideRouter([])],
    })
      .overrideComponent(VarCvarTrend, {
        remove: { imports: [LineChartComponent] },
        add: { imports: [LineChartStub] },
      })
      .overrideComponent(UnderwaterChart, {
        remove: { imports: [LineChartComponent] },
        add: { imports: [LineChartStub] },
      })
      .overrideComponent(CdarCurve, {
        remove: { imports: [LineChartComponent] },
        add: { imports: [LineChartStub] },
      })
      .compileComponents();

    fixture = TestBed.createComponent(RiskMonitoring);
    host = fixture.nativeElement;
    service = TestBed.inject(RiskMonitoringService);
    document.body.appendChild(host);
    fixture.detectChanges();
  });

  afterEach(() => {
    host.remove();
  });

  function text(): string {
    return host.textContent ?? '';
  }

  function buttons(): HTMLButtonElement[] {
    return Array.from(host.querySelectorAll('button'));
  }

  function buttonLabelled(label: string): HTMLButtonElement {
    const match = buttons().find((b) => (b.textContent ?? '').trim().includes(label));
    expect(match).toBeTruthy();
    return match as HTMLButtonElement;
  }

  /** Clicks a segmented-control option and waits for any recompute it starts. */
  async function chooseOption(label: string): Promise<void> {
    buttonLabelled(label).click();
    fixture.detectChanges();
    await service.settled();
    fixture.detectChanges();
  }

  function slider(): HTMLInputElement {
    return host.querySelector('#rm-cdar-alpha') as HTMLInputElement;
  }

  function press(key: string): void {
    slider().dispatchEvent(new KeyboardEvent('keydown', { key, bubbles: true }));
    fixture.detectChanges();
  }

  function readout(): string {
    return host.querySelector('[data-testid="cdar-readout"]')?.textContent?.trim() ?? '';
  }

  function chartFor(title: string): HTMLElement {
    const match = Array.from(host.querySelectorAll('[data-chart-title]')).find(
      (el) => el.getAttribute('data-chart-title') === title,
    );
    expect(match).toBeTruthy();
    return match as HTMLElement;
  }

  /** One row of the threshold table, as the cells actually read. */
  function tableRow(measure: string): string[] {
    const button = host.querySelector(`[data-measure-row="${measure}"]`);
    const row = button?.closest('tr');
    expect(row).toBeTruthy();
    return Array.from(row!.querySelectorAll('th,td')).map((cell) =>
      (cell.textContent ?? '').replace(/\s+/g, ' ').trim(),
    );
  }

  function metricValues(): string[] {
    return Array.from(host.querySelectorAll('[data-testid="metric-value"]')).map(
      (el) => el.textContent?.trim() ?? '',
    );
  }

  // --- regions --------------------------------------------------------------

  it('when the page renders, the eight regions are present in wireframe order', () => {
    const markers = [
      '[data-testid="as-of"]',
      '#rm-readings-heading',
      '#rm-var-cvar-trend',
      '#rm-underwater',
      '#rm-cdar-curve',
      '#rm-thresholds-heading',
      'app-risk-monitoring-alert-log',
      'app-action-button-row',
    ].map((selector) => host.querySelector(selector));

    expect(markers.every((el) => el !== null)).toBe(true);

    const positions = markers.map((el) =>
      Array.prototype.indexOf.call(host.querySelectorAll('*'), el),
    );
    expect(positions).toEqual([...positions].sort((a, b) => a - b));
  });

  it('when the page renders, headings start at h2 and skip no level on the way down', () => {
    const levels = Array.from(host.querySelectorAll('h1,h2,h3,h4,h5,h6')).map((h) =>
      Number(h.tagName.slice(1)),
    );

    expect(levels.length).toBeGreaterThan(0);
    // The shell owns the <h1>; the page's own outline starts one level down.
    expect(Math.min(...levels)).toBe(2);
    expect(levels).not.toContain(1);
    const jumps = levels.filter((level, i) => i > 0 && level > levels[i - 1] + 1);
    expect(jumps).toEqual([]);
  });

  it('when the page renders, the toolbar carries the as-of stamp read-only', () => {
    const stamp = host.querySelector('[data-testid="as-of"]');
    expect(stamp?.textContent).toContain('2026-07-31 16:45 UTC');
    expect(stamp?.querySelector('input')).toBeNull();
  });

  it('when the page renders, the sister pages of the Risk section are the only exits', () => {
    const hrefs = Array.from(host.querySelectorAll('app-action-button-row a')).map((a) =>
      a.getAttribute('href'),
    );
    expect(hrefs).toEqual([
      '/risk/risk-attribution',
      '/risk/stress-testing',
      '/risk/turbulence-systemic',
    ]);
  });

  // --- the populated state --------------------------------------------------

  it('when the page renders, the four readings are the ones the wireframe prints', () => {
    expect(text()).toContain('VaR (95%, hist., 1D)');
    expect(text()).toContain('CVaR / ES (95%)');
    expect(metricValues()).toEqual(['3.42% of NAV', '4.87% of NAV', '−6.1% (rel.)', '47 days']);
  });

  it('when the page renders, the CVaR card recalls that VaR is never the larger', () => {
    expect(text()).toContain('VaR ≤ CVaR');
    expect(host.querySelector('[data-testid="order-note"]')?.textContent).toContain(
      'α_β(w) ≤ φ_β(w)',
    );
  });

  it('when the page renders, each measure is stated against its configured limit', () => {
    expect(tableRow('maxdd')).toEqual([
      expect.stringContaining('MaxDD'),
      '18.4%',
      '30.0%',
      '61% of the limit',
      expect.stringContaining('Warning'),
    ]);
    expect(tableRow('avdd').slice(1, 5)).toEqual([
      '7.2%',
      '10.0%',
      '72% of the limit',
      expect.stringContaining('Warning'),
    ]);
    expect(tableRow('cdar').slice(0, 5)).toEqual([
      expect.stringContaining('Δ_0.95(x)'),
      '9.8%',
      '14.0%',
      '70% of the limit',
      expect.stringContaining('OK'),
    ]);
  });

  it('when the page renders, no control on it can change a limit', () => {
    expect(text()).toContain('Limits are configured in Guardrail & Kill-Switch');
    expect(host.querySelectorAll('app-risk-monitoring-threshold-table input')).toHaveLength(0);
  });

  it('when the page renders, every chart carries a label summarising its reading', () => {
    const labels = Array.from(host.querySelectorAll('[data-aria-label]')).map((el) =>
      el.getAttribute('data-aria-label'),
    );

    expect(labels).toHaveLength(3);
    expect(labels[0]).toContain('CVaR is at or above VaR at every point');
    expect(labels[1]).toContain('returns to exactly zero at each of the 3 new highs');
    expect(labels[2]).toContain('Δ₀');
    expect(labels[2]).toContain('Δ₁');
  });

  // --- the units toggle -----------------------------------------------------

  it('when the units are switched to Abs, the card, the chart and the table move together', async () => {
    await chooseOption('Abs');

    expect(metricValues()[2]).toBe('−€15.3m (abs.)');
    expect(
      chartFor('Underwater / drawdown D(x,t)').querySelector('[data-testid="chart-series"]')
        ?.textContent,
    ).toContain('−€15.3m');
    expect(tableRow('maxdd').slice(1, 3)).toEqual(['€46.0m', '€75.0m']);
  });

  it('when the units are switched, the utilisation is unchanged — it is a ratio', async () => {
    const before = tableRow('avdd')[3];
    await chooseOption('Abs');
    expect(tableRow('avdd')[3]).toBe(before);
  });

  it('when the units are switched, nothing is recomputed', async () => {
    buttonLabelled('Abs').click();
    fixture.detectChanges();

    expect(host.querySelector('[data-testid="risk-monitoring-loading"]')).toBeNull();
    expect(host.querySelector('[data-testid="as-of"]')?.textContent).toContain('16:45 UTC');
  });

  // --- the α slider ---------------------------------------------------------

  it('when the page renders, the α slider announces its range and its reading', () => {
    const alpha = slider();
    expect(alpha.type).toBe('range');
    expect(alpha.getAttribute('aria-valuemin')).toBe('0');
    expect(alpha.getAttribute('aria-valuemax')).toBe('1');
    expect(alpha.getAttribute('aria-valuenow')).toBe('0.95');
    expect(alpha.getAttribute('aria-valuetext')).toBe('α = 0.95, Δ = 9.8%');
  });

  it('when End is pressed, α reaches exactly 1 and Δ is the maximum drawdown', () => {
    press('End');

    expect(slider().getAttribute('aria-valuenow')).toBe('1');
    expect(readout()).toBe('Δ_1.00(x) = 18.4%');
    expect(tableRow('maxdd')[1]).toBe('18.4%');
    expect(tableRow('cdar')[1]).toBe('18.4%');
  });

  it('when Home is pressed, α reaches exactly 0 and Δ is the average drawdown', () => {
    press('Home');

    expect(slider().getAttribute('aria-valuenow')).toBe('0');
    expect(readout()).toBe('Δ_0.00(x) = 7.2%');
    expect(tableRow('avdd')[1]).toBe('7.2%');
    expect(tableRow('cdar')[1]).toBe('7.2%');
  });

  it('when an arrow key is pressed, α steps by one hundredth and stays exact', () => {
    press('ArrowRight');
    expect(slider().getAttribute('aria-valuenow')).toBe('0.96');
    expect(readout()).toContain('Δ_0.96(x)');

    press('ArrowLeft');
    expect(readout()).toBe('Δ_0.95(x) = 9.8%');
  });

  it('when the slider is dragged, the readout follows the handle', () => {
    const alpha = slider();
    alpha.value = '0.5';
    alpha.dispatchEvent(new Event('input'));
    fixture.detectChanges();

    expect(readout()).toContain('Δ_0.50(x)');
    expect(alpha.getAttribute('aria-valuetext')).toContain('α = 0.50');
  });

  it('when the slider moves, only the readout, the marker and the CDaR row change', () => {
    const readings = metricValues();
    const trend = chartFor('VaR & CVaR trend').textContent;
    const underwater = chartFor('Underwater / drawdown D(x,t)').textContent;
    const maxdd = tableRow('maxdd');
    const avdd = tableRow('avdd');

    press('End');

    expect(metricValues()).toEqual(readings);
    expect(chartFor('VaR & CVaR trend').textContent).toBe(trend);
    expect(chartFor('Underwater / drawdown D(x,t)').textContent).toBe(underwater);
    expect(tableRow('maxdd')).toEqual(maxdd);
    expect(tableRow('avdd')).toEqual(avdd);
    // A level is not a calculation: the page never enters the loading state.
    expect(host.querySelector('[data-testid="risk-monitoring-loading"]')).toBeNull();
    expect(readout()).toBe('Δ_1.00(x) = 18.4%');
  });

  it('when α reaches an end, the curve marker says which elementary measure it is', () => {
    press('End');
    expect(chartFor('CDaR curve Δ_α(x)').textContent).toContain('Δ_1.00(x) = 18.4% = MaxDD');

    press('Home');
    expect(chartFor('CDaR curve Δ_α(x)').textContent).toContain('Δ_0.00(x) = 7.2% = AvDD');
  });

  // --- a threshold row marks a chart ---------------------------------------

  it('when a threshold row is activated, the matching part of its chart is marked', () => {
    (host.querySelector('[data-measure-row="maxdd"]') as HTMLButtonElement).click();
    fixture.detectChanges();

    const marked = host.querySelector('[data-testid="underwater-highlight"]');
    expect(marked?.textContent).toContain('MaxDD −18.4%');
    expect(marked?.textContent).toContain(service.drawdownSummary().maxDrawdownAt);
    expect(
      host.querySelector('[data-measure-row="maxdd"]')?.closest('tr')?.getAttribute('aria-current'),
    ).toBe('true');
    expect(scrollIntoView).toHaveBeenCalled();
  });

  it('when a threshold row is activated, the focus travels with the scroll', () => {
    (host.querySelector('[data-measure-row="maxdd"]') as HTMLButtonElement).click();
    fixture.detectChanges();

    // Scrolling on its own would leave a keyboard reader parked in the table,
    // several screens below the figure they asked to see, with the next Tab
    // landing somewhere off-screen too.
    expect(document.activeElement).toBe(host.querySelector('#rm-underwater'));
  });

  it('when the CDaR row is activated, the CDaR curve is the figure marked instead', () => {
    (host.querySelector('[data-measure-row="cdar"]') as HTMLButtonElement).click();
    fixture.detectChanges();

    expect(host.querySelector('[data-testid="cdar-highlight"]')?.textContent).toContain(
      'Δ_0.95(x) = 9.8% against a 14.0% limit',
    );
    expect(host.querySelector('[data-testid="underwater-highlight"]')).toBeNull();
  });

  it('when the average drawdown is activated, it is marked as a level, not as a date', () => {
    (host.querySelector('[data-measure-row="avdd"]') as HTMLButtonElement).click();
    fixture.detectChanges();

    const marked = host.querySelector('[data-testid="underwater-highlight"]')?.textContent ?? '';
    expect(marked).toContain('AvDD −7.2%');
    expect(marked).toContain('time average');
    expect(marked).not.toMatch(/\d{4}-\d{2}-\d{2}/);
  });

  // --- a log entry marks an observation ------------------------------------

  it('when a log entry is activated, its detail expands and its observation is marked', () => {
    const entry = service.recentAlerts()[0];
    buttonLabelled(entry.text).click();
    fixture.detectChanges();

    const detail = host.querySelector('[data-testid="alert-detail"]');
    expect(detail?.textContent).toContain(entry.at);
    expect(detail?.textContent).toContain(entry.detail ?? '');
    expect(detail?.textContent).toContain('underwater / drawdown chart');
    expect(host.querySelector('[data-testid="underwater-highlight"]')?.textContent).toContain(
      entry.text,
    );
    expect(scrollIntoView).toHaveBeenCalled();
  });

  it('when a CDaR alert is activated, the curve is the figure marked', () => {
    const entry = service.recentAlerts().find((e) => e.text.includes('CDaR'))!;
    buttonLabelled(entry.text).click();
    fixture.detectChanges();

    expect(host.querySelector('[data-testid="cdar-highlight"]')?.textContent).toContain(entry.text);
    expect(host.querySelector('[data-testid="alert-detail"]')?.textContent).toContain(
      'CDaR curve above',
    );
  });

  it('when a CDaR alert is activated, the mark is not claimed at a date that curve does not plot', () => {
    const entry = service.recentAlerts().find((e) => e.text.includes('CDaR'))!;
    buttonLabelled(entry.text).click();
    fixture.detectChanges();

    const anchor = host.querySelector('[data-testid="alert-anchor"]')?.textContent ?? '';
    expect(anchor).toContain('on the CDaR curve above');
    // The curve's axis is α. The entry's stamp is a trading day, and naming it
    // here would send the reader looking along an axis that has no dates.
    expect(anchor).not.toMatch(/\d{4}-\d{2}-\d{2}/);
  });

  it('when the log is expanded, the whole history is shown', () => {
    expect(host.querySelectorAll('app-event-log-panel li')).toHaveLength(3);

    buttonLabelled('View all alerts').click();
    fixture.detectChanges();

    expect(host.querySelectorAll('app-event-log-panel li')).toHaveLength(service.alertLog().length);
  });

  // --- states ---------------------------------------------------------------

  it('when no portfolio is selected, the dashboard is replaced by one sentence', () => {
    service.selectPortfolio(null);
    fixture.detectChanges();

    expect(text()).toContain('Select a portfolio to see its risk dashboard.');
    expect(host.querySelector('#rm-underwater')).toBeNull();
    expect(host.querySelector('table')).toBeNull();
    // The toolbar describes a reading; there is simply nothing to read yet.
    expect(host.querySelector('[data-testid="as-of"]')).not.toBeNull();
  });

  it('while the measures are being computed, the regions are placeholders and the toolbar refuses input', async () => {
    const pending = service.refresh();
    fixture.detectChanges();

    const loading = host.querySelector('[data-testid="risk-monitoring-loading"]');
    expect(loading?.getAttribute('aria-busy')).toBe('true');
    expect(text()).toContain('Computing current VaR, CVaR and drawdown measures');
    expect(host.querySelector('#rm-underwater')).toBeNull();
    expect((host.querySelector('#rm-holding-period') as HTMLSelectElement).disabled).toBe(true);
    expect((host.querySelector('#rm-lookback') as HTMLSelectElement).disabled).toBe(true);
    // The radiogroup stays reachable and announced, and refuses the change.
    expect(buttonLabelled('99%').getAttribute('aria-disabled')).toBe('true');

    await pending;
    fixture.detectChanges();
    expect(host.querySelector('[data-testid="risk-monitoring-loading"]')).toBeNull();
  });

  it('while the measures are being computed, the alert history is left where it is', async () => {
    const pending = service.refresh();
    fixture.detectChanges();

    // None of the toolbar's parameters rewrites the log, so it is not a
    // placeholder: it is the one region on the page that did not change.
    expect(host.querySelectorAll('app-event-log-panel li')).toHaveLength(3);

    await pending;
  });

  it('when the calculation fails, the last known figures stay on screen and are called stale', async () => {
    await service.refresh(true);
    fixture.detectChanges();

    expect(text()).toContain('Could not compute the risk measures for the selected portfolio.');
    expect(host.querySelector('[data-testid="stale-label"]')?.textContent).toContain('stale data');
    // The dashboard is not emptied: an old reading is not the same as none.
    expect(metricValues()[0]).toBe('3.42% of NAV');
    expect(host.querySelector('#rm-underwater')).not.toBeNull();
    expect(tableRow('maxdd')[1]).toBe('18.4%');
  });

  it('when the calculation fails, the stale figures lose their colour, not their contrast', async () => {
    await service.refresh(true);
    fixture.detectChanges();

    const greyed = host.querySelector('[data-testid="stale-label"]')?.parentElement;
    expect(greyed).not.toBeNull();
    // `--color-text-secondary` carries every note, limit and axis label on this
    // page. At 60% opacity it lands near 2.6:1 on white, under the 4.5:1 the
    // doc asks to be verified; desaturating leaves every ratio where it was.
    expect(greyed?.className).not.toMatch(/\bopacity-\d/);
    expect(greyed?.classList.contains('grayscale')).toBe(true);
  });

  it('when the failed calculation is retried, the error and the stale label clear together', async () => {
    await service.refresh(true);
    fixture.detectChanges();

    buttonLabelled('Retry').click();
    fixture.detectChanges();
    await new Promise((resolve) => setTimeout(resolve, 800));
    fixture.detectChanges();

    expect(text()).not.toContain('Could not compute the risk measures');
    expect(host.querySelector('[data-testid="stale-label"]')).toBeNull();
  });

  // --- edge cases -----------------------------------------------------------

  it('when the historical sample is too thin, the note names the way out and nothing switches', async () => {
    await chooseOption('99%');

    const note = host.querySelector('[data-testid="insufficient-history"]');
    expect(note?.textContent).toContain('Switch Method to Parametric');
    expect(note?.getAttribute('role')).toBe('status');
    // The method the toolbar claims is still the method that produced the number.
    expect(text()).toContain('VaR (99%, hist., 1D)');
  });

  it('when the two measures nearly coincide, the trend is annotated and neither is redefined', async () => {
    await chooseOption('99%');
    await chooseOption('Parametric');

    const note = host.querySelector('[data-testid="tail-coincidence"]');
    expect(note?.textContent).toContain('nearly coincide');
    expect(note?.textContent).toContain('Neither measure is redefined');
    expect(metricValues()[0]).not.toBe(metricValues()[1]);
  });

  it('when the lookback window changes, only that chart re-extends', async () => {
    const readings = metricValues();
    const before = chartFor('VaR & CVaR trend').textContent;

    const select = host.querySelector('#rm-lookback') as HTMLSelectElement;
    select.value = '3M';
    select.dispatchEvent(new Event('change'));
    fixture.detectChanges();

    expect(chartFor('VaR & CVaR trend').textContent).not.toBe(before);
    expect(metricValues()).toEqual(readings);
    expect(host.querySelector('[data-testid="risk-monitoring-loading"]')).toBeNull();
  });

  it('when the confidence level changes, the readings are recomputed under the new label', async () => {
    await chooseOption('90%');

    expect(text()).toContain('VaR (90%, hist., 1D)');
    expect(metricValues()[0]).not.toBe('3.42% of NAV');
    expect(host.querySelector('[data-testid="as-of"]')?.textContent).toContain('16:46 UTC');
  });
});
