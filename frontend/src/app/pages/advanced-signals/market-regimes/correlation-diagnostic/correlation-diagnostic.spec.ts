/**
 * The exceedance-correlation diagnostic.
 *
 * The scatter is stubbed — jsdom has no canvas — and the stub renders the
 * accessible label, the series names with their symbols, and the reference
 * mark, so the assertions stay about what a reader is given.
 *
 * Two things matter more than the rest. The verdict on each model has to be
 * *derived* from its own asymmetry gap rather than written into the template,
 * and the direction of the asymmetry has to come from the pair: equity against
 * long bonds runs the other way from two equity sleeves, and labelling it as
 * downside-higher would be a claim the data does not make.
 */

import { Component, computed, input } from '@angular/core';
import { ComponentFixture, TestBed } from '@angular/core/testing';

import { MarketRegimesService } from '../../../../services/market-regimes.service';
import { ScatterChartComponent } from '../../../../shared/charts';
import type { RefLine, ValueFormatter, XySeries } from '../../../../shared/charts';
import { CorrelationDiagnostic } from './correlation-diagnostic';

@Component({
  selector: 'app-scatter-chart',
  template: `
    <div [attr.data-aria-label]="ariaLabel()" [attr.data-chart-title]="title()">
      <span data-testid="chart-series">{{ names() }}</span>
      <span data-testid="chart-refs">{{ refs() }}</span>
      <ng-content />
    </div>
  `,
})
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

  /** Name, symbol and point count — the three things that make a series legible. */
  protected readonly names = computed(() =>
    this.series()
      .map((series) => `${series.name}:${series.symbol}:${series.points.length}`)
      .join(' | '),
  );

  protected readonly refs = computed(() =>
    this.refLines()
      .map((line) => line.label ?? '')
      .join(' | '),
  );
}

describe('CorrelationDiagnostic', () => {
  let fixture: ComponentFixture<CorrelationDiagnostic>;
  let host: HTMLElement;
  let service: MarketRegimesService;

  beforeEach(async () => {
    await TestBed.configureTestingModule({ imports: [CorrelationDiagnostic] })
      .overrideComponent(CorrelationDiagnostic, {
        remove: { imports: [ScatterChartComponent] },
        add: { imports: [ScatterChartStub] },
      })
      .compileComponents();

    fixture = TestBed.createComponent(CorrelationDiagnostic);
    host = fixture.nativeElement;
    service = TestBed.inject(MarketRegimesService);
    document.body.appendChild(host);
    fixture.detectChanges();
  });

  afterEach(() => host.remove());

  function text(testId: string): string {
    return host.querySelector(`[data-testid="${testId}"]`)?.textContent?.replace(/\s+/g, ' ').trim() ?? '';
  }

  function attr(name: string): string {
    return host.querySelector(`[${name}]`)?.getAttribute(name) ?? '';
  }

  function slider(): HTMLInputElement {
    return host.querySelector('#mr-theta') as HTMLInputElement;
  }

  function press(key: string, init: KeyboardEventInit = {}): KeyboardEvent {
    const event = new KeyboardEvent('keydown', { key, bubbles: true, cancelable: true, ...init });
    slider().dispatchEvent(event);
    fixture.detectChanges();
    return event;
  }

  function reading(model: string): string {
    return host.querySelector(`[data-model="${model}"]`)?.textContent?.replace(/\s+/g, ' ').trim() ?? '';
  }

  async function settle(): Promise<void> {
    await service.settled();
    fixture.detectChanges();
  }

  // --- the four series ------------------------------------------------------

  it('when the diagnostic renders, four series are drawn and told apart by symbol', () => {
    expect(text('chart-series')).toBe(
      'Empirical:circle:17 | Regime-switching model:emptyCircle:17 | Normal:diamond:17 | Asym. GARCH:triangle:17',
    );
  });

  it('when the diagnostic renders, it is titled with the pair it is taken on', () => {
    expect(attr('data-chart-title')).toBe('Exceedance correlation — Large cap – Small cap');
  });

  // --- the verdicts are derived, not written --------------------------------

  it('when the models are compared, only the regime-switching one reproduces the asymmetry', () => {
    expect(reading('empirical')).toContain('the benchmark the three models are judged against');
    expect(reading('regime-switching')).toContain('reproduces the empirical asymmetry');
    expect(reading('normal')).toContain('does not reproduce the empirical asymmetry');
    expect(reading('asymmetric-garch')).toContain('does not reproduce the empirical asymmetry');
  });

  it('when the pattern is stated, it is stated in the accessible label and not beside the figure', () => {
    const label = attr('data-aria-label');
    expect(label).toContain('the downside exceedance correlations sit above the opposite side');
    expect(label).toContain('Regime-switching model reproduces that asymmetry.');
    expect(label).toContain('Normal and Asym. GARCH do not.');
    // The visible copy describes what θ selects, not what the curve shows.
    expect(host.textContent).not.toContain('sit systematically above');
  });

  it('when the pair runs the other way, the label follows the pair and not a rule of thumb', async () => {
    service.setPair('equity-bond');
    fixture.detectChanges();

    expect(attr('data-aria-label')).toContain('the upside exceedance correlations sit above');
    expect(attr('data-aria-label')).not.toContain('the downside exceedance correlations sit above');
    await settle();
  });

  // --- the threshold --------------------------------------------------------

  it('when the diagnostic renders, the slider spans the symmetric grid and announces a reading', () => {
    expect(slider().type).toBe('range');
    expect(slider().min).toBe('-2');
    expect(slider().max).toBe('2');
    expect(slider().step).toBe('0.25');
    expect(slider().getAttribute('aria-valuenow')).toBe('0');
    expect(slider().getAttribute('aria-valuetext')).toBe(
      'θ = 0.00 standard deviations, symmetric, empirical ρ 0.62',
    );
    expect(text('mr-theta-readout')).toBe('0.00 σ, symmetric');
  });

  it('when the threshold moves to the downside, every series is re-read there', () => {
    press('Home');

    expect(slider().getAttribute('aria-valuenow')).toBe('-2');
    expect(text('mr-theta-readout')).toBe('−2.00 σ, symmetric');
    expect(text('chart-refs')).toBe('θ = −2.00');
    expect(reading('empirical')).toContain('ρ 0.88');
    expect(reading('normal')).toContain('ρ 0.23');
  });

  it('when the threshold moves to the upside, the empirical correlation falls away', () => {
    press('End');

    expect(slider().getAttribute('aria-valuenow')).toBe('2');
    expect(reading('empirical')).toContain('ρ 0.28');
  });

  it('when an arrow key is pressed, θ steps by one grid step in that direction', () => {
    press('ArrowRight');
    expect(slider().getAttribute('aria-valuenow')).toBe('0.25');
    press('ArrowLeft');
    press('ArrowLeft');
    expect(slider().getAttribute('aria-valuenow')).toBe('-0.25');
  });

  it('when a key the slider owns is pressed, the browser does not step it a second time', () => {
    expect(press('ArrowRight').defaultPrevented).toBe(true);
    expect(press('End').defaultPrevented).toBe(true);
    expect(press('Tab').defaultPrevented).toBe(false);
    expect(press('ArrowLeft', { metaKey: true }).defaultPrevented).toBe(false);
  });

  it('when the handle is dragged, the readings follow it', () => {
    slider().value = '-1';
    slider().dispatchEvent(new Event('input'));
    fixture.detectChanges();

    expect(text('mr-theta-readout')).toBe('−1.00 σ, symmetric');
    expect(text('chart-refs')).toBe('θ = −1.00');
  });

  // --- the universe decides which pairs exist -------------------------------

  it('when the universe loses a pair, the diagnostic falls back to one it actually has', async () => {
    service.setUniverse('global-multi-asset');
    await settle();

    const options = Array.from(host.querySelectorAll<HTMLOptionElement>('#mr-pair option')).map(
      (option) => option.textContent?.trim(),
    );
    expect(options).toEqual(['Equity – Long bonds', 'Commodities – Equity']);
    expect(attr('data-chart-title')).toBe('Exceedance correlation — Equity – Long bonds');
  });

  it('when the universe carries no pair at all, no correlation is drawn or claimed', async () => {
    service.setUniverse('em-equities');
    await settle();

    expect(text('mr-correlation-empty')).toContain('carries no pair of series to correlate');
    expect(host.querySelector('[data-testid="chart-series"]')).toBeNull();
  });
});
