/**
 * The effective-rank panel, whose whole content is a comparison: the entropy
 * measure against the raw rank it can never exceed.
 */

import { Component, computed, input } from '@angular/core';
import { ComponentFixture, TestBed } from '@angular/core/testing';

import type { CategorySeries, RefPoint, ValueFormatter } from '../../../../shared/charts';
import { LineChartComponent } from '../../../../shared/charts';
import { TurbulenceService } from '../../../../services/turbulence.service';
import { EffectiveRankChart } from './effective-rank-chart';

@Component({
  selector: 'app-line-chart',
  template: `
    <div
      [attr.data-aria-label]="ariaLabel()"
      [attr.data-chart-subtitle]="subtitle()"
      [attr.data-chart-title]="title()"
    >
      <span data-testid="names">{{ names() }}</span>
      <span data-testid="reference">{{ reference() }}</span>
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

  protected readonly names = computed(() =>
    this.series()
      .map((s) => s.name)
      .join(' | '),
  );
  /** Every value of the reference series, deduplicated — it must be constant. */
  protected readonly reference = computed(() =>
    [...new Set(this.series()[1]?.data ?? [])].join(','),
  );
}

describe('EffectiveRankChart', () => {
  let fixture: ComponentFixture<EffectiveRankChart>;
  let host: HTMLElement;
  let service: TurbulenceService;

  beforeEach(async () => {
    await TestBed.configureTestingModule({ imports: [EffectiveRankChart] })
      .overrideComponent(EffectiveRankChart, {
        remove: { imports: [LineChartComponent] },
        add: { imports: [LineChartStub] },
      })
      .compileComponents();

    fixture = TestBed.createComponent(EffectiveRankChart);
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

  it('when the panel renders, the raw rank is on the chart as a flat reference at the asset count', () => {
    expect(testId('names')).toBe('Effective rank | Raw rank — 24 assets');
    expect(testId('reference')).toBe('24');
  });

  it('when the universe changes size, the reference line follows the asset count', () => {
    service.selectUniverse('core-sleeve-12');
    fixture.detectChanges();

    expect(testId('names')).toBe('Effective rank | Raw rank — 12 assets');
    expect(testId('reference')).toBe('12');
  });

  it('when the panel renders, the effective rank sits inside its own bounds at every point', () => {
    const rawRank = service.effectiveRank().rawRank;
    for (const point of service.effectiveRankSeries()) {
      expect(point.effectiveRank).toBeGreaterThanOrEqual(1);
      expect(point.effectiveRank).toBeLessThanOrEqual(rawRank);
    }
  });

  it('when the panel renders, its label states the reading against the raw rank', () => {
    const label = host.querySelector('[data-aria-label]')?.getAttribute('data-aria-label') ?? '';
    expect(label).toContain('against a flat reference line at the raw rank of 24');
    expect(label).toContain('independent directions out of a raw rank of 24');
  });

  it('when the computation fails, the panel says the eigenvalues are unavailable', async () => {
    await service.refreshPanel('effective-rank', true);
    fixture.detectChanges();

    expect(host.querySelector('[data-aria-label]')).toBeNull();
    expect(host.textContent).toContain('The effective rank could not be computed.');
  });
});
