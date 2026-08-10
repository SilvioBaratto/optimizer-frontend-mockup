/**
 * The participation panel: the localized-to-extended reading, the
 * Kaiser-Guttman count beside it, and its independence from the display range.
 */

import { Component, computed, input } from '@angular/core';
import { ComponentFixture, TestBed } from '@angular/core/testing';

import type { CategorySeries, RefPoint, ValueFormatter } from '../../../../shared/charts';
import { LineChartComponent } from '../../../../shared/charts';
import { TurbulenceService } from '../../../../services/turbulence.service';
import { ParticipationChart } from './participation-chart';

@Component({
  selector: 'app-line-chart',
  template: `
    <div
      [attr.data-aria-label]="ariaLabel()"
      [attr.data-chart-subtitle]="subtitle()"
      [attr.data-chart-title]="title()"
    >
      <span data-testid="length">{{ length() }}</span>
      <span data-testid="marks">{{ marks() }}</span>
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

  protected readonly length = computed(() => String(this.series()[0]?.data.length ?? 0));
  protected readonly marks = computed(() =>
    this.refPoints()
      .map((point) => point.label ?? '')
      .join(' | '),
  );
}

describe('ParticipationChart', () => {
  let fixture: ComponentFixture<ParticipationChart>;
  let host: HTMLElement;
  let service: TurbulenceService;

  beforeEach(async () => {
    await TestBed.configureTestingModule({ imports: [ParticipationChart] })
      .overrideComponent(ParticipationChart, {
        remove: { imports: [LineChartComponent] },
        add: { imports: [LineChartStub] },
      })
      .compileComponents();

    fixture = TestBed.createComponent(ParticipationChart);
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

  it('when the panel renders, the state is a word and a glyph, not a position on a scale', () => {
    const reading = service.participation();
    expect(testId('participation-state')).toContain(
      reading.state === 'localized' ? 'Localized' : 'Extended',
    );
    expect(testId('participation-state')).toMatch(/[◔◕]/);
  });

  it('when the panel renders, the Kaiser-Guttman count is printed beside the reading', () => {
    expect(testId('kaiser-count')).toBe(
      `Significant components, Kaiser-Guttman criterion: ${service.participation().significantComponents}`,
    );
  });

  it('when the panel renders, the ratio sits inside its own scale of one to N', () => {
    const n = service.participation().assetCount;
    for (const point of service.participationSeries()) {
      expect(point.participationRatio).toBeGreaterThanOrEqual(1);
      expect(point.participationRatio).toBeLessThanOrEqual(n);
    }
    expect(testId('marks')).toContain(service.participation().participationRatio.toFixed(1));
  });

  it('when the display range narrows, this panel is untouched by it', () => {
    const length = testId('length');

    service.setDisplayRange('6M');
    fixture.detectChanges();

    expect(testId('length')).toBe(length);
  });

  it('when the panel renders, its label explains what the two ends of the scale mean', () => {
    const label = host.querySelector('[data-aria-label]')?.getAttribute('data-aria-label') ?? '';
    expect(label).toContain('a single asset carrying the whole component');
    expect(label).toContain('every asset contributing equally');
    expect(label).toContain('Kaiser-Guttman count of significant components');
  });

  it('when the computation fails, the panel says the first eigenvector is unavailable', async () => {
    await service.refreshPanel('participation', true);
    fixture.detectChanges();

    expect(host.querySelector('[data-aria-label]')).toBeNull();
    expect(host.textContent).toContain('The participation ratio could not be computed.');
  });
});
