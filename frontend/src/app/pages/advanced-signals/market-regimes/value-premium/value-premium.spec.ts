/**
 * The value premium by volatility state.
 *
 * The whole point of this region is separation, so that is what is tested: its
 * two states are its own, they are named in full, they do not appear anywhere
 * else on the page, and the toolbar's Regime model has no effect on them.
 */

import { Component, computed, input } from '@angular/core';
import { ComponentFixture, TestBed } from '@angular/core/testing';

import { MarketRegimesService } from '../../../../services/market-regimes.service';
import { BarChartComponent, seriesColor } from '../../../../shared/charts';
import type { CategorySeries, ValueFormatter } from '../../../../shared/charts';
import { ValuePremium } from './value-premium';

@Component({
  selector: 'app-bar-chart',
  template: `
    <div
      [attr.data-chart-title]="title()"
      [attr.data-aria-label]="ariaLabel()"
      [attr.data-colors]="colours()"
    >
      <span data-testid="chart-cells">{{ cells() }}</span>
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
  readonly categoryAxisName = input('');
  readonly valueAxisName = input('');
  readonly showLegend = input<boolean | undefined>(undefined);
  readonly height = input(320);

  protected readonly cells = computed(() => {
    const format = this.valueFormatter();
    const series = this.series()[0];
    return this.categories()
      .map((category, index) => `${category}=${format(series.data[index] ?? 0)}`)
      .join(' | ');
  });

  protected readonly colours = computed(() =>
    this.series()
      .map((series) => series.color ?? '')
      .join(','),
  );
}

describe('ValuePremium', () => {
  let fixture: ComponentFixture<ValuePremium>;
  let host: HTMLElement;
  let service: MarketRegimesService;

  beforeEach(async () => {
    await TestBed.configureTestingModule({ imports: [ValuePremium] })
      .overrideComponent(ValuePremium, {
        remove: { imports: [BarChartComponent] },
        add: { imports: [BarChartStub] },
      })
      .compileComponents();

    fixture = TestBed.createComponent(ValuePremium);
    host = fixture.nativeElement;
    service = TestBed.inject(MarketRegimesService);
    fixture.detectChanges();
  });

  function text(testId: string): string {
    return host.querySelector(`[data-testid="${testId}"]`)?.textContent?.replace(/\s+/g, ' ').trim() ?? '';
  }

  async function settle(): Promise<void> {
    await service.settled();
    fixture.detectChanges();
  }

  it('when the panel renders, it is headed as its own two-state model', () => {
    expect(host.querySelector('h2')?.textContent?.trim()).toBe(
      'Value premium by volatility state — 2-state Markov',
    );
  });

  it('when the panel renders, its two states are named in full and are its own', () => {
    expect(text('chart-cells')).toBe(
      'High-volatility state, recession-linked=+12.4% | Low-volatility state, expansion-linked=+0.6%',
    );
  });

  it('when the panel renders, it says no row of it lines up with the size premium above', () => {
    expect(text('mr-value-vocabulary')).toContain(
      'neither row here corresponds to a regime of the Size Premium panel above',
    );
  });

  it('when the panel renders, no regime-model state name appears anywhere in it', () => {
    const content = host.textContent ?? '';
    for (const state of ['Crash', 'Slow Growth', 'Bull', 'Recovery', 'Recession', 'Expansion']) {
      expect(content).not.toContain(state);
    }
  });

  it('when the regime model changes, this panel does not move', async () => {
    const before = text('chart-cells');

    service.setModel('hamilton');
    await settle();

    expect(text('chart-cells')).toBe(before);
  });

  it('when the panel renders, it is not drawn in the size premium’s colour', () => {
    const colour = host.querySelector('[data-colors]')?.getAttribute('data-colors') ?? '';
    expect(colour).not.toBe('');
    // These two blocks are the pair the doc insists must never read as one
    // table, and Size Premium draws in slot 0. Slot 4 is not an escape from it:
    // `--color-accent` is a declared alias of `--color-primary`, so it renders
    // the same terracotta.
    expect(colour).not.toBe(seriesColor(0));
    expect(colour).not.toBe(seriesColor(4));
  });

  it('when the figure is described, its label says the states are not the regime model states', () => {
    const label = host.querySelector('[data-aria-label]')?.getAttribute('data-aria-label') ?? '';
    expect(label).toContain('a separate two-state Markov model on book-to-market portfolios');
    expect(label).toContain("These two states are not the regime model's states");
  });
});
