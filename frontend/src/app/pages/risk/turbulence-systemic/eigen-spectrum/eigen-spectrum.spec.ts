/**
 * The spectrum panel: the Wishart bound drawn, the bars past it distinguished
 * in text rather than in colour, and two criteria counted separately.
 */

import { Component, computed, input } from '@angular/core';
import { ComponentFixture, TestBed } from '@angular/core/testing';

import type { CategorySeries, RefLine, ValueFormatter } from '../../../../shared/charts';
import { BarChartComponent } from '../../../../shared/charts';
import { TurbulenceService } from '../../../../services/turbulence.service';
import { EigenSpectrum } from './eigen-spectrum';

@Component({
  selector: 'app-bar-chart',
  template: `
    <div
      [attr.data-aria-label]="ariaLabel()"
      [attr.data-chart-subtitle]="subtitle()"
      [attr.data-chart-title]="title()"
    >
      <span data-testid="categories">{{ names() }}</span>
      <span data-testid="ref-lines">{{ lines() }}</span>
      <span data-testid="lead">{{ lead() }}</span>
      <ng-content />
    </div>
  `,
})
class BarChartStub {
  readonly title = input('');
  readonly subtitle = input('');
  readonly ariaLabel = input('');
  readonly categories = input.required<readonly string[]>();
  readonly series = input.required<readonly CategorySeries[]>();
  readonly orientation = input<'horizontal' | 'vertical'>('horizontal');
  readonly refLines = input<readonly RefLine[]>([]);
  readonly valueFormatter = input<ValueFormatter>((value) => String(value));
  readonly valueAxisName = input('');
  readonly height = input(320);

  protected readonly names = computed(() => this.categories().join(' | '));
  protected readonly lines = computed(() =>
    this.refLines()
      .map((line) => `${line.label ?? ''}@${line.axis ?? 'y'}`)
      .join(' | '),
  );
  protected readonly lead = computed(() => String(this.series()[0]?.data[0] ?? ''));
}

describe('EigenSpectrum', () => {
  let fixture: ComponentFixture<EigenSpectrum>;
  let host: HTMLElement;
  let service: TurbulenceService;

  beforeEach(async () => {
    await TestBed.configureTestingModule({ imports: [EigenSpectrum] })
      .overrideComponent(EigenSpectrum, {
        remove: { imports: [BarChartComponent] },
        add: { imports: [BarChartStub] },
      })
      .compileComponents();

    fixture = TestBed.createComponent(EigenSpectrum);
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

  it('when the panel renders, one bar is drawn per eigenvalue of the current universe', () => {
    const categories = testId('categories').split(' | ');
    expect(categories.length).toBe(24);
    expect(categories[0]).toContain('lambda 1');
  });

  it('when the panel renders, the gamma-plus bound is drawn on the value axis', () => {
    const spectrum = service.spectrum();
    expect(testId('ref-lines')).toBe(
      `gamma+ ${spectrum.gammaPlus.toFixed(2)}@x | Kaiser-Guttman 1.00@x`,
    );
  });

  it('when a bar is above the bound, its own label says so rather than only its colour', () => {
    const spectrum = service.spectrum();
    const marked = testId('categories')
      .split(' | ')
      .filter((label) => label.includes('▲')).length;

    expect(marked).toBe(spectrum.aboveBound);
    expect(marked).toBe(3);
    expect(testId('spectrum-counts')).toContain('3 eigenvalues above the Wishart bound');
  });

  it('when the panel renders, the two criteria are counted separately', () => {
    const spectrum = service.spectrum();
    expect(spectrum.significant).not.toBe(spectrum.aboveBound);
    expect(testId('spectrum-counts')).toContain(
      `${spectrum.significant} satisfy the Kaiser-Guttman criterion`,
    );
    expect(testId('spectrum-counts')).toContain('different criteria and are counted separately');
  });

  it('when another window is chosen, the spectrum is re-read and the rest of the page is not', () => {
    const before = testId('lead');
    const absorption = service.absorption();

    const select = host.querySelector('[data-testid="spectrum-window"]') as HTMLSelectElement;
    select.value = '2025-12-31';
    select.dispatchEvent(new Event('change'));
    fixture.detectChanges();

    expect(service.spectrumWindowId()).toBe('2025-12-31');
    expect(testId('lead')).not.toBe(before);
    expect(host.querySelector('[data-chart-subtitle]')?.getAttribute('data-chart-subtitle')).toContain(
      'Window ending 2025-12-31',
    );
    expect(service.absorption()).toEqual(absorption);
  });

  it('when the panel renders, its label carries Q, the bound and both counts', () => {
    const label = host.querySelector('[data-aria-label]')?.getAttribute('data-aria-label') ?? '';
    expect(label).toContain('T = 100 observations on N = 24 assets');
    expect(label).toContain('Q is');
    expect(label).toContain('eigenvalues sit above it and carry structure');
    expect(label).toContain('Kaiser-Guttman');
  });

  it('when the computation fails, the panel names the window that could not be formed', async () => {
    await service.refreshPanel('spectrum', true);
    fixture.detectChanges();

    expect(host.querySelector('[data-aria-label]')).toBeNull();
    expect(host.textContent).toContain('The eigenvalue spectrum could not be computed');
  });
});
