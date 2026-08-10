/**
 * The Value Spread card.
 *
 * Two claims are held here. The band a factor sits on has to move when the
 * metric moves, because the doc's sceptical thread is that the measure is not
 * unique. And the extrapolation callout has to be *the signal table's own
 * reading of the same factor* — the doc's blocking review finding was that the
 * two sections reported opposite valuations of momentum, so the test compares
 * the callout with the row rather than with a string.
 */

import { Component, computed, input } from '@angular/core';
import { ComponentFixture, TestBed } from '@angular/core/testing';

import { FactorTimingService } from '../../../../services/factor-timing.service';
import { BulletChartComponent } from '../../../../shared/charts';
import type { BulletRow, ValueFormatter } from '../../../../shared/charts';
import { ValueSpread } from './value-spread';

@Component({
  selector: 'app-bullet-chart',
  template: `
    <div [attr.data-chart-title]="title()" [attr.data-aria-label]="ariaLabel()">
      <p data-testid="chart-subtitle">{{ subtitle() }}</p>
      <span data-testid="chart-rows">{{ cells() }}</span>
      <span data-testid="chart-domain">{{ domainMin() }}..{{ domainMax() }}</span>
      <ng-content />
    </div>
  `,
})
class BulletChartStub {
  readonly title = input('');
  readonly subtitle = input('');
  readonly ariaLabel = input('');
  readonly rows = input.required<readonly BulletRow[]>();
  readonly mode = input<'fill' | 'marker'>('fill');
  readonly domainMin = input<number | undefined>(undefined);
  readonly domainMax = input<number | undefined>(undefined);
  readonly valueFormatter = input<ValueFormatter>((value) => String(value));
  readonly valueAxisName = input('');
  readonly height = input(320);

  protected readonly cells = computed(() => {
    const format = this.valueFormatter();
    return this.rows()
      .map((row) => `${row.label}=${format(row.value)} ${row.status ?? ''}`.trim())
      .join(' | ');
  });
}

describe('ValueSpread', () => {
  let fixture: ComponentFixture<ValueSpread>;
  let host: HTMLElement;
  let service: FactorTimingService;

  beforeEach(async () => {
    await TestBed.configureTestingModule({ imports: [ValueSpread] })
      .overrideComponent(ValueSpread, {
        remove: { imports: [BulletChartComponent] },
        add: { imports: [BulletChartStub] },
      })
      .compileComponents();

    fixture = TestBed.createComponent(ValueSpread);
    host = fixture.nativeElement;
    service = TestBed.inject(FactorTimingService);
    fixture.detectChanges();
  });

  function text(testId: string): string {
    return host.querySelector(`[data-testid="${testId}"]`)?.textContent?.replace(/\s+/g, ' ').trim() ?? '';
  }

  async function settle(): Promise<void> {
    await service.settled();
    fixture.detectChanges();
  }

  // --- the band -------------------------------------------------------------

  it('when the card renders, each factor sits on the same ±2 SD band', () => {
    expect(text('chart-domain')).toBe('-2..2');
    expect(text('chart-rows')).toContain('HML · Value=−0.62 SD ordinary');
    expect(text('chart-rows')).toContain('BAB · Low Vol=+1.35 SD elevated');
  });

  it('when a reading is shown, its band is carried as a word and not by colour', () => {
    const badge = host.querySelector('[data-spread-badge="low-vol"]')?.textContent ?? '';
    expect(badge).toContain('BAB · Low Vol');
    expect(badge).toContain('+1.35 SD');
    expect(badge).toContain('elevated');
  });

  it('when the sample is read, the card states that nothing is at an extreme', () => {
    expect(text('ft-spread-extreme')).toContain('No factor sits at a historical extreme');
  });

  // --- the measure is not unique -------------------------------------------

  it('when the metric changes, the readings are restated and a band can be crossed', async () => {
    expect(host.querySelector('[data-spread-badge="quality"]')?.textContent).toContain('ordinary');

    service.setValueSpreadMetric('price-book');
    await settle();

    const badge = host.querySelector('[data-spread-badge="quality"]')?.textContent ?? '';
    expect(badge).toContain('elevated');
    expect(host.querySelector('[data-chart-title]')?.getAttribute('data-chart-title')).toBe(
      'Metric P/B',
    );
  });

  it('when the metric is a percentile, the reading prints as a rank, not as a z', async () => {
    service.setValueSpreadMetric('percentile');
    await settle();

    expect(host.querySelector('[data-spread-badge="low-vol"]')?.textContent).toContain('pct');
    expect(text('ft-spread-metric-note')).toContain('can read ordinary on another');
  });

  // --- factors with no band -------------------------------------------------

  it('when a factor has no history, it is named rather than placed at zero', () => {
    const omitted = host.querySelector('[data-spread-omitted="profitability"]')?.textContent ?? '';
    expect(omitted).toContain('Profitability');
    expect(omitted).toContain('no band');
    expect(text('chart-rows')).not.toContain('Profitability');
  });

  // --- the callout ----------------------------------------------------------

  it('when a row conflicts, the callout repeats that row’s own two readings', () => {
    const row = service.signalRows().find((entry) => entry.factor === 'momentum');

    expect(row?.conflict).toBe(true);
    expect(row?.valuation).toBe('down');
    // The table's arrow says rich; the callout must not say cheap.
    expect(text('ft-extrapolation-summary')).toContain('valuation reads rich');
    expect(text('ft-extrapolation-summary')).not.toContain('cheap');
    expect(text('ft-extrapolation-summary')).toContain('trailing return is strong');
  });

  it('when the callout renders, it points at the guardrail banner instead of repeating it', () => {
    const link = host.querySelector('[data-testid="ft-extrapolation-banner-link"]');

    expect(link?.getAttribute('aria-controls')).toBe('ft-guardrail-banner');
    expect(text('ft-extrapolation-check')).not.toContain('near-arbitrage');
    expect(text('ft-extrapolation-check')).not.toContain('performance chasing disabled');
  });

  it('when the reference is pressed, it moves the reader rather than leaving the page', () => {
    // `<base href="/">` makes a bare `#fragment` resolve against the base, so
    // an anchor here would navigate to `/#ft-guardrail-banner` — off the page.
    const anchor = document.createElement('div');
    anchor.id = 'ft-guardrail-banner';
    anchor.tabIndex = -1;
    document.body.append(anchor);

    const reference = host.querySelector<HTMLElement>('[data-testid="ft-extrapolation-banner-link"]');
    expect(reference?.tagName.toLowerCase()).toBe('button');

    reference?.click();

    expect(document.activeElement).toBe(anchor);
    anchor.remove();
  });

  it('when nothing conflicts, the callout is absent rather than empty', async () => {
    service.setFactorsInView(['quality', 'low-vol']);
    await settle();

    expect(service.conflictedRows()).toEqual([]);
    expect(host.querySelector('[data-testid="ft-extrapolation-check"]')).toBeNull();
  });

  // --- the figure's description --------------------------------------------

  it('when the figure is described, the description carries the readings and the extreme claim', () => {
    const label = host.querySelector('[data-aria-label]')?.getAttribute('data-aria-label') ?? '';

    expect(label).toContain('HML');
    expect(label).toContain('ordinary');
    expect(label).toContain('No factor sits at a historical extreme');
  });
});
