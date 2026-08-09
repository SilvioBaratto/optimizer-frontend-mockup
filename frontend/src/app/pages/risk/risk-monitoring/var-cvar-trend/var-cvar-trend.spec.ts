/**
 * The VaR/CVaR trend.
 *
 * The chart itself is stubbed — ECharts wants a canvas — so what is checked is
 * what the figure was handed: two series in the order that gives VaR the solid
 * line and CVaR the dashed one, the end markers that must agree with the cards
 * above, a window that slices rather than recomputes, and a label that says the
 * reading in words.
 */

import { Component, computed, input } from '@angular/core';
import { ComponentFixture, TestBed } from '@angular/core/testing';

import { RiskMonitoringService } from '../../../../services/risk-monitoring.service';
import { LineChartComponent } from '../../../../shared/charts';
import type { CategorySeries, RefPoint, ValueFormatter } from '../../../../shared/charts';
import { VarCvarTrend } from './var-cvar-trend';

@Component({
  selector: 'app-line-chart',
  template: `
    <div [attr.data-aria-label]="ariaLabel()">
      <span data-testid="chart-series">{{ summary() }}</span>
      <span data-testid="chart-refs">{{ refs() }}</span>
      <span data-testid="chart-subtitle">{{ subtitle() }}</span>
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

  protected readonly summary = computed(() => {
    const format = this.valueFormatter();
    return this.series()
      .map(
        (s) =>
          `${s.name}: ${format(s.data[0] ?? 0)} … ${format(s.data[s.data.length - 1] ?? 0)} (${s.data.length} points)`,
      )
      .join(' | ');
  });

  protected readonly refs = computed(() =>
    this.refPoints()
      .map((point) => point.label ?? '')
      .join(' | '),
  );
}

describe('VarCvarTrend', () => {
  let fixture: ComponentFixture<VarCvarTrend>;
  let host: HTMLElement;
  let service: RiskMonitoringService;

  beforeEach(async () => {
    await TestBed.configureTestingModule({ imports: [VarCvarTrend] })
      .overrideComponent(VarCvarTrend, {
        remove: { imports: [LineChartComponent] },
        add: { imports: [LineChartStub] },
      })
      .compileComponents();

    fixture = TestBed.createComponent(VarCvarTrend);
    host = fixture.nativeElement;
    service = TestBed.inject(RiskMonitoringService);
    document.body.appendChild(host);
    fixture.detectChanges();
  });

  afterEach(() => {
    host.remove();
  });

  function series(): string {
    return host.querySelector('[data-testid="chart-series"]')?.textContent ?? '';
  }

  function refs(): string {
    return host.querySelector('[data-testid="chart-refs"]')?.textContent ?? '';
  }

  function ariaLabel(): string {
    return host.querySelector('[data-aria-label]')?.getAttribute('data-aria-label') ?? '';
  }

  it('when the trend renders, VaR is the first series and CVaR the second', () => {
    // Order is what gives VaR the solid line and CVaR the dashed one, which is
    // the distinction that survives greyscale.
    expect(series()).toMatch(/^VaR: .* \| CVaR: /);
    expect(host.textContent).toContain('VaR solid · CVaR dashed');
  });

  it('when the trend renders, its right-hand end is the reading the cards print', () => {
    expect(refs()).toContain('CVaR 4.87%');
    expect(refs()).toContain('VaR 3.42%');
    expect(series()).toContain('3.42%');
    expect(series()).toContain('4.87%');
  });

  it('when the trend renders, the label says the reading and its ordering in words', () => {
    expect(ariaLabel()).toContain('95% confidence');
    expect(ariaLabel()).toContain('Historical method');
    expect(ariaLabel()).toContain('CVaR is at or above VaR at every point');
  });

  it('when the trend renders, the subtitle names every assumption behind it', () => {
    expect(host.querySelector('[data-testid="chart-subtitle"]')?.textContent).toBe(
      '1Y · 95% · Historical · 1 day',
    );
  });

  it('when the window narrows, the same figures are shown over fewer points', () => {
    const full = series();
    expect(full).toContain('(53 points)');

    service.setLookback('3M');
    fixture.detectChanges();

    // The right-hand end is untouched — a window is a slice, not a new series.
    expect(series()).toContain('(14 points)');
    expect(series()).toContain('3.42%');
    expect(series()).not.toBe(full);
  });

  it('when the tail is ordinary, the chart carries no coincidence annotation', () => {
    expect(host.querySelector('[data-testid="tail-coincidence"]')).toBeNull();
  });

  it('when the two nearly coincide, the chart is annotated and neither is redefined', async () => {
    service.setConfidence(99);
    await service.settled();
    service.setMethod('parametric');
    await service.settled();
    fixture.detectChanges();

    const note = host.querySelector('[data-testid="tail-coincidence"]');
    expect(note?.getAttribute('role')).toBe('status');
    expect(note?.textContent).toContain('nearly coincide');
    expect(note?.textContent).toContain('Neither measure is redefined');
    expect(ariaLabel()).toContain('The two nearly coincide');
    // Still two series, still in order.
    expect(series()).toMatch(/^VaR: .* \| CVaR: /);
  });
});
