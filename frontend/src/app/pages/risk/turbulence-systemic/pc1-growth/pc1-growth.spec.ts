/**
 * The PC1 growth panel: two controls that really change the reading, the peak
 * event, the distribution the current reading falls in, and the saturation the
 * source describes past about twenty months.
 */

import { Component, computed, input } from '@angular/core';
import { ComponentFixture, TestBed } from '@angular/core/testing';

import type {
  CategorySeries,
  HistogramBin,
  RefPoint,
  ValueFormatter,
} from '../../../../shared/charts';
import { HistogramChartComponent, LineChartComponent } from '../../../../shared/charts';
import { TurbulenceService } from '../../../../services/turbulence.service';
import { Pc1Growth } from './pc1-growth';

@Component({
  selector: 'app-line-chart',
  template: `
    <div
      [attr.data-aria-label]="ariaLabel()"
      [attr.data-chart-subtitle]="subtitle()"
      [attr.data-chart-title]="title()"
    >
      <span data-testid="marks">{{ marks() }}</span>
      <span data-testid="last">{{ last() }}</span>
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

  protected readonly marks = computed(() =>
    this.refPoints()
      .map((point) => point.label ?? '')
      .join(' | '),
  );
  protected readonly last = computed(() => {
    const data = this.series()[0]?.data ?? [];
    return this.valueFormatter()(data[data.length - 1] ?? 0);
  });
}

@Component({
  selector: 'app-histogram-chart',
  template: `
    <div [attr.data-aria-label]="ariaLabel()" [attr.data-annotation]="annotation()">
      <span data-testid="bins">{{ labels() }}</span>
      <span data-testid="highlighted">{{ highlighted() }}</span>
    </div>
  `,
})
class HistogramChartStub {
  readonly title = input('');
  readonly subtitle = input('');
  readonly ariaLabel = input('');
  readonly bins = input.required<readonly HistogramBin[]>();
  readonly orientation = input<'horizontal' | 'vertical'>('horizontal');
  readonly valueFormatter = input<ValueFormatter>((value) => String(value));
  readonly valueAxisName = input('');
  readonly binAxisName = input('');
  readonly annotation = input('');
  readonly height = input(320);

  protected readonly labels = computed(() => this.bins().map((bin) => bin.label).join(' | '));
  protected readonly highlighted = computed(() =>
    this.bins()
      .filter((bin) => bin.highlight)
      .map((bin) => bin.label)
      .join(' | '),
  );
}

describe('Pc1Growth', () => {
  let fixture: ComponentFixture<Pc1Growth>;
  let host: HTMLElement;
  let service: TurbulenceService;

  beforeEach(async () => {
    await TestBed.configureTestingModule({ imports: [Pc1Growth] })
      .overrideComponent(Pc1Growth, {
        remove: { imports: [LineChartComponent, HistogramChartComponent] },
        add: { imports: [LineChartStub, HistogramChartStub] },
      })
      .compileComponents();

    fixture = TestBed.createComponent(Pc1Growth);
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

  function select(id: string): HTMLSelectElement {
    return host.querySelector(`[data-testid="${id}"]`) as HTMLSelectElement;
  }

  function choose(id: string, value: string): void {
    const element = select(id);
    element.value = value;
    element.dispatchEvent(new Event('change'));
    fixture.detectChanges();
  }

  it('when the panel renders, the lookback is 12 months and the horizon is 1', () => {
    expect(select('pc1-lookback').value).toBe('12');
    expect(select('pc1-horizon').value).toBe('1');
    expect(host.querySelector('label[for="ts-pc1-lookback"]')?.textContent?.trim()).toBe(
      'Lookback n',
    );
  });

  it('when the panel renders, the peak event is marked on the line', () => {
    expect(testId('marks')).toContain(`peak ${service.pc1().peakMonth}`);
    expect(testId('last')).toBe('52%');
  });

  it('when the lookback changes, the reading and the line change with it', () => {
    const before = service.pc1().share;
    choose('pc1-lookback', '3');

    expect(service.pc1Lookback()).toBe(3);
    expect(service.pc1().share).not.toBe(before);
  });

  it('when the lookback passes the saturation point, the panel says the signal has stopped moving', () => {
    choose('pc1-lookback', '20');
    expect(host.querySelector('[data-testid="pc1-saturation"]')).toBeNull();
    const atSaturation = service.pc1Series().map((point) => point.share);

    choose('pc1-lookback', '36');

    expect(testId('pc1-saturation')).toContain('the signal saturates');
    expect(host.querySelector('[data-testid="pc1-saturation"]')?.getAttribute('role')).toBe(
      'status',
    );
    expect(service.pc1Series().map((point) => point.share)).toEqual(atSaturation);
  });

  it('when the distribution renders, the current bin is highlighted and named in words', () => {
    const current = service.pc1Distribution().find((bin) => bin.current);
    expect(testId('highlighted')).toBe(`${current?.label} ◀ current`);

    const annotation =
      host.querySelector('[data-annotation]')?.getAttribute('data-annotation') ?? '';
    expect(annotation).toContain(`decile ${service.pc1().decile} of 10`);
    expect(annotation).toContain('right tail');
  });

  it('when the horizon changes, the distribution is rebuilt at the new horizon', () => {
    const before = testId('bins');
    choose('pc1-horizon', '6');

    expect(service.pc1Horizon()).toBe(6);
    expect(testId('bins')).not.toBe(before);
  });

  it('when the computation fails, one placeholder replaces both figures', async () => {
    await service.refreshPanel('pc1-growth', true);
    fixture.detectChanges();

    expect(host.querySelector('[data-aria-label]')).toBeNull();
    expect(host.textContent).toContain('The PC1 variance share could not be computed');
  });
});
