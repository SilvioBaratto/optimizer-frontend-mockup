/**
 * The underwater curve.
 *
 * Three claims are worth a test here, because all three are things the drawing
 * alone cannot be trusted to say: the series is drawn as a fall, MaxDD and AvDD
 * are levels rather than points on it, and a highlight handed in from elsewhere
 * only ever marks an observation the path actually contains.
 */

import { Component, computed, input } from '@angular/core';
import { ComponentFixture, TestBed } from '@angular/core/testing';

import { RiskMonitoringService } from '../../../../services/risk-monitoring.service';
import { LineChartComponent } from '../../../../shared/charts';
import type { CategorySeries, RefLine, RefPoint, ValueFormatter } from '../../../../shared/charts';
import { UnderwaterChart } from './underwater-chart';

@Component({
  selector: 'app-line-chart',
  template: `
    <div [attr.data-aria-label]="ariaLabel()">
      <span data-testid="chart-series">{{ summary() }}</span>
      <span data-testid="chart-lines">{{ lines() }}</span>
      <span data-testid="chart-points">{{ points() }}</span>
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

  protected readonly summary = computed(() => {
    const format = this.valueFormatter();
    const data = this.series()[0]?.data ?? [];
    const worst = Math.min(...(data as number[]));
    return `${format(data[0] ?? 0)} … ${format(data[data.length - 1] ?? 0)} worst ${format(worst)} (${data.length} points)`;
  });

  protected readonly lines = computed(() =>
    this.refLines()
      .map((line) => `${line.label ?? ''}@${line.value.toFixed(1)}`)
      .join(' | '),
  );

  protected readonly points = computed(() =>
    this.refPoints()
      .map((point) => `${point.x}:${point.label ?? ''}`)
      .join(' | '),
  );
}

describe('UnderwaterChart', () => {
  let fixture: ComponentFixture<UnderwaterChart>;
  let host: HTMLElement;
  let service: RiskMonitoringService;

  beforeEach(async () => {
    await TestBed.configureTestingModule({ imports: [UnderwaterChart] })
      .overrideComponent(UnderwaterChart, {
        remove: { imports: [LineChartComponent] },
        add: { imports: [LineChartStub] },
      })
      .compileComponents();

    fixture = TestBed.createComponent(UnderwaterChart);
    host = fixture.nativeElement;
    service = TestBed.inject(RiskMonitoringService);
    document.body.appendChild(host);
    fixture.detectChanges();
  });

  afterEach(() => {
    host.remove();
  });

  function read(testid: string): string {
    return host.querySelector(`[data-testid="${testid}"]`)?.textContent ?? '';
  }

  function ariaLabel(): string {
    return host.querySelector('[data-aria-label]')?.getAttribute('data-aria-label') ?? '';
  }

  it('when the curve renders, it is drawn as a fall from the running maximum', () => {
    // Starts at a new high, ends at the current drawdown, deepest at MaxDD.
    expect(read('chart-series')).toContain('0.0% … −6.1%');
    expect(read('chart-series')).toContain('worst −18.4%');
    expect(read('chart-series')).toContain('(252 points)');
  });

  it('when the curve renders, the zero line is named as the running maximum', () => {
    expect(read('chart-lines')).toContain('running max@0.0');
  });

  it('when the curve renders, MaxDD and AvDD are levels and the current value a marker', () => {
    expect(read('chart-lines')).toContain('MaxDD −18.4%@-18.4');
    expect(read('chart-lines')).toContain('AvDD −7.2%@-7.2');
    expect(read('chart-points')).toContain('now −6.1%');
  });

  it('when the curve renders, its footnote restates both references and the duration', () => {
    expect(read('underwater-footnote')).toBe(
      'MaxDD −18.4% ref · AvDD −7.2% ref · time underwater 47 days',
    );
  });

  it('when the curve renders, the label counts the highs it returns to zero at', () => {
    expect(ariaLabel()).toContain('252 observations');
    expect(ariaLabel()).toContain('47 days');
    expect(ariaLabel()).toContain('returns to exactly zero at each of the 3 new highs');
  });

  it('when the units switch to Abs, every figure on the chart restates in money', () => {
    service.setDrawdownUnits('abs');
    fixture.detectChanges();

    expect(read('chart-series')).toContain('€0.0m … −€15.3m');
    expect(read('chart-lines')).toContain('MaxDD −€46.0m');
    expect(read('chart-lines')).toContain('AvDD −€18.0m');
    expect(read('underwater-footnote')).toContain('time underwater 47 days');
    expect(ariaLabel()).toContain('€15.3m below its running maximum');
  });

  it('when nothing is highlighted, the chart carries no extra mark', () => {
    expect(host.querySelector('[data-testid="underwater-highlight"]')).toBeNull();
    expect(read('chart-points').split('|')).toHaveLength(1);
  });

  it('when a highlight names an observation, it is marked and said in words', () => {
    const trough = service.drawdownSummary().maxDrawdownAt;
    fixture.componentRef.setInput('highlight', {
      date: trough,
      label: `MaxDD −18.4% on ${trough}`,
    });
    fixture.detectChanges();

    expect(read('chart-points')).toContain(`${trough}:${trough} −18.4%`);
    const caption = host.querySelector('[data-testid="underwater-highlight"]');
    expect(caption?.getAttribute('role')).toBe('status');
    expect(caption?.textContent).toContain(`MaxDD −18.4% on ${trough}`);
  });

  it('when a highlight names no observation, no point is invented for it', () => {
    fixture.componentRef.setInput('highlight', {
      date: null,
      label: 'AvDD −7.2% — the time average',
    });
    fixture.detectChanges();

    expect(read('chart-points').split('|')).toHaveLength(1);
    expect(host.querySelector('[data-testid="underwater-highlight"]')?.textContent).toContain(
      'time average',
    );
  });

  it('when a highlight names a date the path does not contain, nothing is marked', () => {
    fixture.componentRef.setInput('highlight', { date: '1999-01-04', label: 'Long ago' });
    fixture.detectChanges();

    expect(read('chart-points')).not.toContain('1999-01-04');
    expect(read('chart-points').split('|')).toHaveLength(1);
  });
});
