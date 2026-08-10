/**
 * The absorption panel: the ratio, the average correlation it is deliberately
 * not, the spikes that precede drawdowns, and the coverage of its own 500-day
 * window.
 */

import { Component, computed, input } from '@angular/core';
import { ComponentFixture, TestBed } from '@angular/core/testing';

import type { CategorySeries, RefPoint, ValueFormatter } from '../../../../shared/charts';
import { LineChartComponent } from '../../../../shared/charts';
import { TurbulenceService } from '../../../../services/turbulence.service';
import { AbsorptionChart } from './absorption-chart';

@Component({
  selector: 'app-line-chart',
  template: `
    <div
      [attr.data-aria-label]="ariaLabel()"
      [attr.data-chart-title]="title()"
      [attr.data-chart-subtitle]="subtitle()"
    >
      <span data-testid="marks">{{ marks() }}</span>
      <span data-testid="points">{{ count() }}</span>
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
  readonly refPoints = input<readonly RefPoint[]>([]);
  readonly valueFormatter = input<ValueFormatter>((value) => String(value));
  readonly xAxisName = input('');
  readonly yAxisName = input('');
  readonly height = input(320);

  protected readonly marks = computed(() => String(this.refPoints().length));
  protected readonly count = computed(() => String(this.series()[0]?.data.length ?? 0));
}

describe('AbsorptionChart', () => {
  let fixture: ComponentFixture<AbsorptionChart>;
  let host: HTMLElement;
  let service: TurbulenceService;

  beforeEach(async () => {
    await TestBed.configureTestingModule({ imports: [AbsorptionChart] })
      .overrideComponent(AbsorptionChart, {
        remove: { imports: [LineChartComponent] },
        add: { imports: [LineChartStub] },
      })
      .compileComponents();

    fixture = TestBed.createComponent(AbsorptionChart);
    host = fixture.nativeElement;
    service = TestBed.inject(TurbulenceService);
    document.body.appendChild(host);
    fixture.detectChanges();
  });

  afterEach(() => {
    host.remove();
  });

  function subtitle(): string {
    return host.querySelector('[data-chart-subtitle]')?.getAttribute('data-chart-subtitle') ?? '';
  }

  function ariaLabel(): string {
    return host.querySelector('[data-aria-label]')?.getAttribute('data-aria-label') ?? '';
  }

  it('when the panel renders, it prints the ratio, the average correlation and the shift', () => {
    const reading = service.absorption();
    expect(subtitle()).toBe(
      `AR ${reading.absorptionRatio.toFixed(2)} · average pairwise correlation ` +
        `${reading.averageCorrelation.toFixed(2)} · dAR 15d vs 1y +1.2σ`,
    );
    expect(reading.absorptionRatio).toBeGreaterThan(reading.averageCorrelation);
  });

  it('when the panel renders, the marks are the spikes plus the current reading', () => {
    const spikes = service.absorptionSeries().filter((point) => point.spike).length;
    const last = service.absorptionSeries()[service.absorptionSeries().length - 1];
    const expected = spikes + (last.spike ? 0 : 1);
    expect(host.querySelector('[data-testid="marks"]')?.textContent).toBe(String(expected));
    expect(host.textContent).toContain('at or above 1 sigma');
  });

  it('when the panel renders, its label carries both shifts and the spike verdict', () => {
    expect(ariaLabel()).toContain('The standardised 15-day against 1-year shift is +1.2σ');
    expect(ariaLabel()).toContain('at or above the one-sigma spike threshold');
    expect(ariaLabel()).toContain('over twelve months it is');
  });

  it('when the display range narrows, the drawing shortens and the reading does not move', () => {
    const before = service.absorption();
    const wide = service.absorptionSeries().length;

    service.setDisplayRange('6M');
    fixture.detectChanges();

    expect(service.absorptionSeries().length).toBeLessThan(wide);
    expect(service.absorption()).toEqual(before);
    expect(subtitle()).toContain(`AR ${before.absorptionRatio.toFixed(2)}`);
  });

  it('when the 500-day window covers the universe, no partial-coverage badge is shown', () => {
    // The rebuilt universe is short of the correlation window but not of this
    // one, so this panel keeps a complete cover while its neighbours do not.
    service.selectUniverse('multi-asset-24-rebuilt');
    fixture.detectChanges();

    expect(service.correlationCoverage().partial).toBe(true);
    expect(service.absorptionCoverage().partial).toBe(false);
    expect(host.querySelector('[data-testid="partial-coverage"]')).toBeNull();
  });

  it('when the computation fails, the panel names the missing window', async () => {
    await service.refreshPanel('absorption', true);
    fixture.detectChanges();

    expect(host.querySelector('[data-aria-label]')).toBeNull();
    expect(host.textContent).toContain('Fewer than 500 days of aligned returns');
  });
});
