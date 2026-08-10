/**
 * The Regime & Market State card.
 *
 * The case this file exists for is the one the doc makes a rule: the regime
 * shown here is the **shared** engine's, so every assertion below drives
 * `MarketRegimesService` and reads the card. If the card ever grew a filter of
 * its own, none of these would move.
 */

import { ComponentFixture, TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';

import { FactorTimingService } from '../../../../services/factor-timing.service';
import { MarketRegimesService } from '../../../../services/market-regimes.service';
import { RegimeMarketState } from './regime-market-state';

describe('RegimeMarketState', () => {
  let fixture: ComponentFixture<RegimeMarketState>;
  let host: HTMLElement;
  let regimes: MarketRegimesService;
  let service: FactorTimingService;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [RegimeMarketState],
      providers: [provideRouter([])],
    }).compileComponents();

    fixture = TestBed.createComponent(RegimeMarketState);
    host = fixture.nativeElement;
    regimes = TestBed.inject(MarketRegimesService);
    service = TestBed.inject(FactorTimingService);
    fixture.detectChanges();
  });

  function text(testId: string): string {
    return host.querySelector(`[data-testid="${testId}"]`)?.textContent?.replace(/\s+/g, ' ').trim() ?? '';
  }

  async function settle(): Promise<void> {
    await regimes.settled();
    fixture.detectChanges();
  }

  // --- one engine -----------------------------------------------------------

  it('when the card renders, the regime states are the shared filter’s own', () => {
    const shown = Array.from(host.querySelectorAll('[data-regime-state]')).map((node) =>
      node.getAttribute('data-regime-state'),
    );

    expect(shown).toEqual(regimes.stateProbabilities().map((entry) => entry.state));
    expect(text('ft-regime-states')).toContain('Crash 58%');
  });

  it('when the shared model switches to two states, this card shows two', async () => {
    regimes.setModel('hamilton');
    await settle();

    const shown = Array.from(host.querySelectorAll('[data-regime-state]')).map((node) =>
      node.getAttribute('data-regime-state'),
    );
    expect(shown).toEqual(['Recession', 'Expansion']);
  });

  it('when the shared lookback changes, the trend state is restated over the new window', async () => {
    expect(text('ft-trend-state')).toContain('UP');

    regimes.setMomentumLookback(12);
    fixture.detectChanges();

    // 12 months of cumulative market return is negative, so the shared state
    // flips — and this card follows it rather than holding its own.
    expect(text('ft-trend-state')).toContain('DOWN');
    expect(text('ft-trend-state')).toContain('bearish');
  });

  it('when the market state is UP, the two crash flags are stated in words', () => {
    expect(text('ft-trend-state')).toContain('not bearish');
    expect(text('ft-trend-state')).toContain('no high-volatility flag');
    expect(text('ft-crash-reason')).toContain('not armed');
  });

  // --- the value chain is a grouping, not a second fit ---------------------

  it('when the value regime is shown, it carries the shared filter’s mass and says so', () => {
    const high = host.querySelector('[data-value-regime="high-volatility"]')?.textContent ?? '';
    const low = host.querySelector('[data-value-regime="low-volatility"]')?.textContent ?? '';

    const readings = service.valueRegime();
    expect(high).toContain(`${Math.round(readings[0].probability)}%`);
    expect(low).toContain(`${Math.round(readings[1].probability)}%`);
    // The premium beside each state is doc 22's, not a second estimate.
    expect(high).toContain('12.4%');
    expect(low).toContain('0.6%');
    expect(text('ft-value-regime-source')).toContain('runs no second filter');
  });

  // --- uncertainty ----------------------------------------------------------

  it('when the top probability is below the threshold, the badge names the reason', () => {
    expect(text('ft-regime-uncertain')).toContain('Regime uncertain');
    expect(text('ft-regime-uncertain')).toContain('below 60%');
  });

  it('when the top probability clears the threshold, the badge is gone', async () => {
    regimes.setModel('hamilton');
    await settle();

    expect(host.querySelector('[data-testid="ft-regime-uncertain"]')).toBeNull();
  });

  // --- the two states this card owns ---------------------------------------

  it('when the shared filter has no sample, a sentence stands in for the numbers', async () => {
    regimes.setUniverse('em-equities');
    await settle();

    expect(text('ft-regime-empty')).toContain('no estimate');
    expect(host.querySelectorAll('[data-regime-state]').length).toBe(0);
    // Never a row of zeros: a zero probability is a claim nobody made.
    expect(text('ft-regime-empty')).not.toContain('0%');
  });

  it('when the shared filter fails, only this card shows the error and it can be retried', async () => {
    await regimes.refresh(true);
    fixture.detectChanges();

    expect(text('ft-regime-error')).toContain('Regime model failed to converge');
    // A background read that failed is announced politely, not as an alert.
    expect(host.querySelector('[data-testid="ft-regime-error"] [role]')?.getAttribute('role')).toBe(
      'status',
    );

    const retry = host.querySelector('[data-testid="ft-regime-error"] button') as HTMLButtonElement;
    retry.click();
    await settle();

    expect(regimes.errorMessage()).toBeNull();
    expect(host.querySelector('[data-testid="ft-regime-error"]')).toBeNull();
  });

  // --- the shared-engine reference -----------------------------------------

  it('when the card renders, it links across to the page that owns the estimate', () => {
    const link = host.querySelector('a[href="/advanced-signals/market-regimes"]');
    expect(link?.textContent).toContain('Open in Market Regimes');
  });

  it('when the card renders, its projected heading is actually on screen', () => {
    // `app-info-card` finds a projected title with `contentChild(CardTitle)`,
    // so a template that projects `<h3 appCardTitle>` without importing the
    // directive renders no header at all and drops the heading silently.
    const heading = host.querySelector('app-info-card h3');

    expect(heading?.textContent).toContain('Regime state shared with Macro & Regimes Agent');
  });
});
