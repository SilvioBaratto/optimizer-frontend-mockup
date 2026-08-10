/**
 * The timing comparison panel.
 *
 * The panel exists to make one distinction survive: market timing has **no**
 * out-of-sample information ratio, and that is not a ratio of zero. The bar
 * chart is stubbed so the tests can read what the panel actually handed it — a
 * `null` in the measured series and a hatched marker carrying the absence —
 * rather than a rendering of it.
 *
 * Two more lines are held here. The expected-utility gain is a different
 * measure and must not appear on the information-ratio axis. And no variant is
 * highlighted as recommended unless the reader asks.
 */

import { Component, computed, input } from '@angular/core';
import { ComponentFixture, TestBed } from '@angular/core/testing';

import { BarChartComponent } from '../../../../shared/charts';
import type { CategorySeries, ValueFormatter } from '../../../../shared/charts';
import { TimingComparison } from './timing-comparison';

@Component({
  selector: 'app-bar-chart',
  template: `
    <div [attr.data-chart-subtitle]="subtitle()" [attr.data-aria-label]="ariaLabel()">
      <span data-testid="chart-cells">{{ cells() }}</span>
      <span data-testid="chart-patterned">{{ patterned() }}</span>
      <span data-testid="chart-categories">{{ categories().join(',') }}</span>
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
  readonly valueFormatter = input<ValueFormatter>((value) => String(value));
  readonly unavailableLabel = input('not available');
  readonly valueMax = input<number | undefined>(undefined);
  readonly categoryAxisName = input('');
  readonly valueAxisName = input('');
  readonly optionPatch = input<Record<string, unknown>>({});
  readonly height = input(320);

  /** What the panel's own tooltip would say for one category. */
  tooltipFor(dataIndex: number): string {
    const tooltip = this.optionPatch()['tooltip'] as
      | { formatter?: (params: { dataIndex: number }[]) => string }
      | undefined;
    return tooltip?.formatter?.([{ dataIndex }]) ?? '';
  }

  /** Exactly what each bar would print, nulls included. */
  protected readonly cells = computed(() => {
    const format = this.valueFormatter();
    return this.categories()
      .map((category, index) => {
        const drawn = this.series()
          .map((series) => {
            const value = series.data[index];
            const missing = value === null || value === undefined;
            const label = missing ? this.unavailableLabel() : format(value);
            return `${series.name}=${label}${!missing && series.pattern ? '(hatched)' : ''}`;
          })
          .join(', ');
        return `${category} [${drawn}]`;
      })
      .join(' | ');
  });

  protected readonly patterned = computed(() =>
    this.categories()
      .filter((_, index) =>
        this.series().some((series) => series.pattern === true && series.data[index] !== null),
      )
      .join(','),
  );
}

describe('TimingComparison', () => {
  let fixture: ComponentFixture<TimingComparison>;
  let host: HTMLElement;

  beforeEach(async () => {
    await TestBed.configureTestingModule({ imports: [TimingComparison] })
      .overrideComponent(TimingComparison, {
        remove: { imports: [BarChartComponent] },
        add: { imports: [BarChartStub] },
      })
      .compileComponents();

    fixture = TestBed.createComponent(TimingComparison);
    host = fixture.nativeElement;
    fixture.detectChanges();
  });

  function text(testId: string): string {
    return host.querySelector(`[data-testid="${testId}"]`)?.textContent?.replace(/\s+/g, ' ').trim() ?? '';
  }

  // --- the measured ratios --------------------------------------------------

  it('when the panel renders, each defined ratio carries its number', () => {
    expect(text('chart-cells')).toContain(
      'Factor timing [Information ratio, out of sample=0.42',
    );
    expect(text('chart-cells')).toContain('Anomaly timing [Information ratio, out of sample=0.60');
    expect(text('chart-cells')).toContain(
      'Pure anomaly timing [Information ratio, out of sample=0.59',
    );
  });

  // --- the variant with no ratio -------------------------------------------

  it('when a variant has no reported ratio, its bar is a gap and never a zero', () => {
    expect(text('chart-cells')).toContain('Market timing [Information ratio, out of sample=—');
    expect(text('chart-cells')).not.toContain('Information ratio, out of sample=0.00');
  });

  it('when a variant has no reported ratio, the hatched marker sits on it and on no other', () => {
    expect(text('chart-patterned')).toBe('Market timing');
    expect(text('chart-cells')).toContain('Not measured=not measured(hatched)');
  });

  it('when a bar is inspected, the tooltip never invents a ratio for the absent one', () => {
    const stub = fixture.debugElement.query(
      (node) => node.componentInstance instanceof BarChartStub,
    ).componentInstance as BarChartStub;

    // The stock axis tooltip reads the raw data: the `null` bar is drawn at the
    // origin, so it would print "Information ratio, out of sample 0", and the
    // hatched marker's extent would leak as "Not measured 0.75".
    const marketTiming = stub.tooltipFor(0);
    expect(marketTiming).toContain('Market timing');
    expect(marketTiming).toContain('not measured');
    expect(marketTiming).not.toContain('0.75');
    expect(marketTiming).not.toMatch(/\b0(\.0+)?\b/);

    expect(stub.tooltipFor(1)).toContain('0.42');
  });

  it('when a variant has no reported ratio, it is stated in text as well as hatched', () => {
    const stated = host.querySelector('[data-unmeasured="market-timing"]')?.textContent ?? '';
    expect(stated).toContain('not measured');
    expect(stated).toContain('it is not a ratio of zero');
  });

  // --- the baseline is a different absence ---------------------------------

  it('when the baseline is named, it is off the axis rather than a second empty bar', () => {
    expect(text('chart-categories')).toBe(
      'Market timing,Factor timing,Anomaly timing,Pure anomaly timing',
    );
    expect(text('chart-categories')).not.toContain('Factor investing');
    expect(text('ft-baseline-note')).toContain('baseline');
    expect(text('ft-baseline-note')).toContain('no bar of its own');
  });

  it('when the figure is described, both kinds of absence are described as absences', () => {
    const label = host.querySelector('[data-aria-label]')?.getAttribute('data-aria-label') ?? '';

    expect(label).toContain('measured against Factor investing');
    expect(label).toContain('no bar of its own');
    expect(label).toContain(
      'Market timing has no reported out-of-sample information ratio and is drawn as a hatched marker, not as a zero',
    );
  });

  // --- the expected-utility gain is a different measure --------------------

  it('when the utility gain is shown, it sits in its own box with its own heading', () => {
    const box = host.querySelector('[data-testid="ft-utility-box"]') as HTMLElement;

    expect(box.querySelector('h3')?.textContent).toContain(
      'Expected-utility gain vs factor investing',
    );
    expect(box.textContent).toContain('not comparable on that axis');
    // Its numbers are inside that box, not among the chart's categories.
    expect(box.querySelector('[data-utility-gain="market-timing"]')?.textContent).toContain('+0.03');
    expect(
      box.querySelector('[data-utility-gain="pure-anomaly-timing"]')?.textContent,
    ).toContain('+1.26');
    expect(text('ft-utility-range')).toContain('1.66 → 2.96');
  });

  it('when the utility gain is shown, none of its numbers reaches the information-ratio axis', () => {
    expect(text('chart-cells')).not.toContain('1.26');
    expect(text('chart-cells')).not.toContain('0.03');
    expect(text('chart-cells')).not.toContain('2.96');
  });

  // --- no recommendation by default ----------------------------------------

  it('when the panel renders, no variant is marked recommended', () => {
    expect(text('ft-no-recommendation')).toContain('No variant is marked recommended');
    expect(host.querySelector('[data-testid="ft-evidence-reading"]')).toBeNull();
    expect(host.textContent).not.toContain('Recommended');
  });

  it('when the reader asks, the reading of the evidence appears with its caveats', () => {
    const toggle = host.querySelector('[data-testid="ft-reading-toggle"]') as HTMLButtonElement;
    expect(toggle.getAttribute('aria-expanded')).toBe('false');

    toggle.click();
    fixture.detectChanges();

    expect(toggle.getAttribute('aria-expanded')).toBe('true');
    expect(text('ft-evidence-reading')).toContain('highest reported out-of-sample information ratio');
    expect(text('ft-evidence-reading')).toContain('transaction costs');
  });
});
