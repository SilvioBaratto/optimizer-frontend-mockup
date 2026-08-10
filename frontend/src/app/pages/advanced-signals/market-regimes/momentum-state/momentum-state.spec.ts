/**
 * Momentum's own market state — the page's third state vocabulary.
 *
 * The cases below hold two lines. The UP/DOWN taxonomy must share no member and
 * no colour with the regime model or with the value premium, and the crash
 * indicator must read as a flag with two named conditions rather than as a
 * number — including when only one half of it holds, which is the case that a
 * continuous score would blur.
 */

import { Component, computed, input } from '@angular/core';
import { ComponentFixture, TestBed } from '@angular/core/testing';

import { MarketRegimesService } from '../../../../services/market-regimes.service';
import { BarChartComponent, chartTokens, seriesColor } from '../../../../shared/charts';
import type { CategorySeries, ValueFormatter } from '../../../../shared/charts';
import { MomentumStatePanel } from './momentum-state';

@Component({
  selector: 'app-bar-chart',
  template: `
    <div
      [attr.data-chart-title]="title()"
      [attr.data-aria-label]="ariaLabel()"
      [attr.data-colors]="colors()"
    >
      <span class="chart-readings">{{ readings() }}</span>
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
  readonly categoryAxisName = input('');
  readonly valueAxisName = input('');
  readonly showLegend = input<boolean | undefined>(undefined);
  readonly height = input(320);

  /** Every cell the chart would print, including the ones that have no value. */
  protected readonly readings = computed(() => {
    const format = this.valueFormatter();
    return this.categories()
      .map((category, index) => {
        const cells = this.series()
          .map((series) => {
            const value = series.data[index];
            return `${series.name}=${value === null || value === undefined ? this.unavailableLabel() : format(value)}`;
          })
          .join(', ');
        return `${category} [${cells}]`;
      })
      .join(' | ');
  });

  protected readonly colors = computed(() =>
    this.series()
      .map((series) => series.color ?? 'palette')
      .join(','),
  );
}

describe('MomentumStatePanel', () => {
  let fixture: ComponentFixture<MomentumStatePanel>;
  let host: HTMLElement;
  let service: MarketRegimesService;

  beforeEach(async () => {
    await TestBed.configureTestingModule({ imports: [MomentumStatePanel] })
      .overrideComponent(MomentumStatePanel, {
        remove: { imports: [BarChartComponent] },
        add: { imports: [BarChartStub] },
      })
      .compileComponents();

    fixture = TestBed.createComponent(MomentumStatePanel);
    host = fixture.nativeElement;
    service = TestBed.inject(MarketRegimesService);
    fixture.detectChanges();
  });

  function text(testId: string): string {
    return host.querySelector(`[data-testid="${testId}"]`)?.textContent?.replace(/\s+/g, ' ').trim() ?? '';
  }

  function chart(title: string): HTMLElement {
    const match = host.querySelector(`[data-chart-title="${title}"]`);
    expect(match).toBeTruthy();
    return match as HTMLElement;
  }

  function readings(title: string): string {
    return chart(title).querySelector('.chart-readings')?.textContent?.trim() ?? '';
  }

  function radio(label: string): HTMLButtonElement {
    const match = Array.from(host.querySelectorAll<HTMLButtonElement>('button[role="radio"]')).find(
      (button) => (button.textContent ?? '').trim() === label,
    );
    expect(match).toBeTruthy();
    return match as HTMLButtonElement;
  }

  function condition(id: string): string {
    return host.querySelector(`[data-condition="${id}"]`)?.textContent?.replace(/\s+/g, ' ').trim() ?? '';
  }

  async function settle(): Promise<void> {
    await service.settled();
    fixture.detectChanges();
  }

  // --- the third vocabulary -------------------------------------------------

  it('when the panel renders, it says its states are not the regime model states', () => {
    expect(text('mr-momentum-vocabulary')).toContain('are not the regime model');
    expect(text('mr-momentum-state')).toBe('▲ UP');
    expect(host.textContent).toContain('36-month cumulative market return +18.6%, at or above zero');
  });

  it('when the panel renders, its bars borrow no colour from the regime palette', () => {
    const tokens = chartTokens();
    const regimeColours = [0, 1, 2, 3].map((index) => seriesColor(index));

    for (const title of ['Conditional WML profit, per month', 'WML Sharpe by weighting']) {
      const colours = (chart(title).getAttribute('data-colors') ?? '').split(',');
      expect(colours).not.toContain('palette');
      for (const colour of colours) expect(regimeColours).not.toContain(colour);
    }
    expect(chart('WML Sharpe by weighting').getAttribute('data-colors')).toBe(tokens.neutral);
  });

  it('when the regime model changes, this panel is untouched by it', async () => {
    const before = text('mr-momentum-state');

    service.setModel('hamilton');
    await settle();

    expect(text('mr-momentum-state')).toBe(before);
    expect(host.textContent).not.toContain('Recession');
  });

  // --- the conditional profits ----------------------------------------------

  it('when the profits are drawn, the state that preceded each window is in its label', () => {
    expect(readings('Conditional WML profit, per month')).toBe(
      'Months 1–6 after UP [Raw=+0.93%, CAPM-adjusted=+1.12%] | ' +
        'Months 1–6 after DOWN [Raw=−0.37%, CAPM-adjusted=+0.01%] | ' +
        'Months 13–60 after UP [Raw=−0.36%, CAPM-adjusted=not fixed by the domain substance]',
    );
  });

  it('when the long horizon reverses, it is called a reversal and not a smaller number', () => {
    expect(text('mr-momentum-reversal')).toContain('is a reversal');
    expect(text('mr-momentum-reversal')).toContain('the opposite sign to the first six');
  });

  it('when the Sharpe ratios are drawn, all three weightings are readable as numbers', () => {
    expect(readings('WML Sharpe by weighting')).toBe(
      'static [WML Sharpe=0.6] | vol-scaled [WML Sharpe=1.0] | dynamic [WML Sharpe=1.2]',
    );
  });

  // --- the composite flag ---------------------------------------------------

  it('when neither condition holds, the flag is off and both halves are still named', () => {
    expect(text('mr-crash-risk')).toBe('○ not armed');
    expect(text('mr-crash-reason')).toContain('needs bear state AND high realised vol (126d)');
    expect(condition('bear-state')).toContain('does not hold');
    expect(condition('bear-state')).toContain('market state UP over 36 months');
    expect(condition('high-volatility')).toContain('does not hold');
    expect(condition('high-volatility')).toContain('22.0% annualised on Equities + Bonds');
    expect(condition('high-volatility')).toContain('threshold 30.0%');
  });

  it('when only the volatility half holds, the flag stays off and says which half is missing', async () => {
    service.setUniverse('equities-only');
    await settle();

    expect(text('mr-crash-risk')).toBe('○ not armed');
    expect(condition('high-volatility')).toContain('holds');
    expect(condition('bear-state')).toContain('does not hold');
    expect(text('mr-crash-reason')).toContain('the market state is not bear');
  });

  it('when only the bear half holds, the flag stays off and says which half is missing', async () => {
    radio('12 months').click();
    fixture.detectChanges();

    expect(text('mr-momentum-state')).toBe('▼ DOWN');
    expect(text('mr-crash-risk')).toBe('○ not armed');
    expect(condition('bear-state')).toContain('holds');
    expect(text('mr-crash-reason')).toContain('realised volatility (126d) is not high');
    await settle();
  });

  it('when both conditions hold together, and only then, the flag arms', async () => {
    service.setUniverse('equities-only');
    await settle();
    radio('12 months').click();
    fixture.detectChanges();

    expect(text('mr-crash-risk')).toBe('⚑ armed');
    expect(condition('bear-state')).toContain('holds');
    expect(condition('high-volatility')).toContain('holds');
    expect(text('mr-crash-reason')).toContain('hold together');
  });

  // --- the lookback ---------------------------------------------------------

  it('when the lookback changes, the state is re-decided on the new horizon', () => {
    expect(radio('36 months').getAttribute('aria-checked')).toBe('true');

    radio('24 months').click();
    fixture.detectChanges();

    expect(service.momentumLookback()).toBe(24);
    expect(text('mr-momentum-state')).toBe('▲ UP');
    expect(host.textContent).toContain('24-month cumulative market return +3.1%');
  });
});
