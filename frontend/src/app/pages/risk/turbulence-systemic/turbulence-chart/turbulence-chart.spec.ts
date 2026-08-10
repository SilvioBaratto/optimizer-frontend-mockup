/**
 * The turbulence panel.
 *
 * Three claims are tested through the rendered chart rather than through the
 * service: the threshold line is derived from the current asset count, the
 * shaded bands are cut against that same line, and the series group refuses to
 * empty itself.
 */

import { Component, computed, input } from '@angular/core';
import { ComponentFixture, TestBed } from '@angular/core/testing';

import type {
  CategorySeries,
  RefBand,
  RefLine,
  RefPoint,
  ValueFormatter,
} from '../../../../shared/charts';
import { LineChartComponent } from '../../../../shared/charts';
import { chiSquaredThreshold, TurbulenceService } from '../../../../services/turbulence.service';
import { TurbulenceChart } from './turbulence-chart';

@Component({
  selector: 'app-line-chart',
  template: `
    <div
      [attr.data-aria-label]="ariaLabel()"
      [attr.data-chart-title]="title()"
      [attr.data-chart-subtitle]="subtitle()"
    >
      <span data-testid="series-names">{{ names() }}</span>
      <span data-testid="ref-lines">{{ lines() }}</span>
      <span data-testid="ref-bands">{{ bands() }}</span>
      <span data-testid="ref-points">{{ marks() }}</span>
      <span data-testid="last-values">{{ ends() }}</span>
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
  readonly refBands = input<readonly RefBand[]>([]);
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
  protected readonly lines = computed(() =>
    this.refLines()
      .map((line) => `${line.label ?? ''}@${line.value.toFixed(4)}`)
      .join(' | '),
  );
  protected readonly bands = computed(() =>
    this.refBands()
      .map((band) => `${band.from}-${band.to}`)
      .join(' | '),
  );
  protected readonly marks = computed(() =>
    this.refPoints()
      .map((point) => point.label ?? '')
      .join(' | '),
  );
  protected readonly ends = computed(() => {
    const format = this.valueFormatter();
    return this.series()
      .map((s) => `${s.name}: ${format(s.data[s.data.length - 1] ?? 0)}`)
      .join(' | ');
  });
}

describe('TurbulenceChart', () => {
  let fixture: ComponentFixture<TurbulenceChart>;
  let host: HTMLElement;
  let service: TurbulenceService;

  beforeEach(async () => {
    await TestBed.configureTestingModule({ imports: [TurbulenceChart] })
      .overrideComponent(TurbulenceChart, {
        remove: { imports: [LineChartComponent] },
        add: { imports: [LineChartStub] },
      })
      .compileComponents();

    fixture = TestBed.createComponent(TurbulenceChart);
    host = fixture.nativeElement;
    service = TestBed.inject(TurbulenceService);
    document.body.appendChild(host);
    fixture.detectChanges();
  });

  afterEach(() => {
    host.remove();
  });

  function testId(id: string): string {
    return (host.querySelector(`[data-testid="${id}"]`)?.textContent ?? '').trim();
  }

  function checkbox(id: string): HTMLInputElement {
    return host.querySelector(`[data-testid="series-${id}"]`) as HTMLInputElement;
  }

  function ariaLabel(): string {
    return host.querySelector('[data-aria-label]')?.getAttribute('data-aria-label') ?? '';
  }

  // --- the threshold ---------------------------------------------------------

  it('when the panel renders, the threshold line is chi-squared at the current asset count', () => {
    const expected = chiSquaredThreshold(24) / 24;
    expect(testId('ref-lines')).toBe(
      `chi2 threshold ${expected.toFixed(2)} for 24 assets@${expected.toFixed(4)}`,
    );
  });

  it('when the universe changes size, the threshold line and the bands are re-cut', () => {
    const wide = testId('ref-lines');
    const wideBands = testId('ref-bands');

    service.selectUniverse('core-sleeve-12');
    fixture.detectChanges();

    const sleeve = chiSquaredThreshold(12) / 12;
    expect(chiSquaredThreshold(12)).toBeCloseTo(14.845, 2);
    expect(testId('ref-lines')).toBe(
      `chi2 threshold ${sleeve.toFixed(2)} for 12 assets@${sleeve.toFixed(4)}`,
    );
    expect(testId('ref-lines')).not.toBe(wide);
    expect(testId('ref-bands')).not.toBe(wideBands);
  });

  it('when the overlay is switched off, the line and the bands go with it and the data stays', () => {
    const values = testId('last-values');

    service.setShowThresholdAndBands(false);
    fixture.detectChanges();

    expect(testId('ref-lines')).toBe('');
    expect(testId('ref-bands')).toBe('');
    expect(testId('last-values')).toBe(values);
    expect(host.textContent).toContain('The chi2 threshold and the outlier bands are hidden');
  });

  it('when bands are drawn, each one falls inside the window on screen', () => {
    const width = service.turbulenceSeries().length;
    const bands = testId('ref-bands')
      .split(' | ')
      .filter(Boolean)
      .map((band) => band.split('-').map(Number));

    expect(bands.length).toBeGreaterThan(0);
    for (const [from, to] of bands) {
      expect(from).toBeGreaterThanOrEqual(0);
      expect(to).toBeLessThan(width);
      expect(to).toBeGreaterThanOrEqual(from);
    }
  });

  // --- the decomposition -----------------------------------------------------

  it('when the panel renders, the current reading is marked and equals magnitude times correlation', () => {
    const reading = service.reading();
    expect(testId('ref-points')).toBe(`2026-07-30  d_t/n ${reading.turbulence.toFixed(2)}`);
    expect(reading.turbulence).toBeCloseTo(
      reading.magnitudeSurprise * reading.correlationSurprise,
      10,
    );
  });

  it('when the panel renders, its label carries the reading on both scales and the verdict', () => {
    const label = ariaLabel();
    expect(label).toContain('turbulence 2.31 normalised');
    expect(label).toContain(`${chiSquaredThreshold(24).toFixed(2)} raw`);
    expect(label).toContain('the reading is above it');
    expect(label).toContain('shaded in this window');
  });

  // --- the series group ------------------------------------------------------

  it('when the panel renders, turbulence and magnitude surprise are the two series drawn', () => {
    expect(testId('series-names')).toBe('Turbulence | Magnitude surprise');
    expect(checkbox('turbulence').checked).toBe(true);
    expect(checkbox('magnitude').checked).toBe(true);
    expect(checkbox('correlation').checked).toBe(false);
  });

  it('when a third series is ticked, it joins the chart in spec order rather than click order', () => {
    checkbox('correlation').click();
    fixture.detectChanges();

    expect(testId('series-names')).toBe('Turbulence | Magnitude surprise | Correlation surprise');
  });

  it('when the last series would be unticked, the box stays ticked and the panel says why', () => {
    checkbox('magnitude').click();
    fixture.detectChanges();
    checkbox('turbulence').click();
    fixture.detectChanges();

    expect(testId('series-names')).toBe('Turbulence');
    expect(checkbox('turbulence').checked).toBe(true);
    expect(testId('series-note')).toContain('At least one series must stay selected.');
    // A refusal of something the reader just did, so assertive — the same call
    // the pairwise inspector makes when X = Y is refused.
    expect(host.querySelector('[data-testid="series-note"]')?.getAttribute('role')).toBe('alert');
  });

  // --- the display range -----------------------------------------------------

  it('when the display range narrows, the drawing shortens and the reading does not move', () => {
    const before = service.reading().turbulence;
    const wide = service.turbulenceSeries().length;

    service.setDisplayRange('6M');
    fixture.detectChanges();

    expect(service.turbulenceSeries().length).toBeLessThan(wide);
    expect(service.reading().turbulence).toBe(before);
    expect(testId('ref-points')).toContain('2026-07-30');
  });

  // --- coverage and failure --------------------------------------------------

  it('when part of the universe is short of the window, the panel says so beside the figure', () => {
    expect(host.querySelector('[data-testid="partial-coverage"]')).toBeNull();

    service.selectUniverse('multi-asset-24-rebuilt');
    fixture.detectChanges();

    expect(host.querySelector('[data-testid="partial-coverage"]')?.textContent).toContain(
      'Partial coverage — 21/24 assets',
    );
    // The value is still drawn.
    expect(testId('last-values')).toContain('Turbulence: 2.31');
  });

  it('when the computation fails, the panel shows its own message instead of the chart', async () => {
    await service.refreshPanel('turbulence', true);
    fixture.detectChanges();

    expect(host.querySelector('[data-aria-label]')).toBeNull();
    expect(host.textContent).toContain('The turbulence score could not be computed');
  });
});
