/**
 * The three cards, and the three readings they must never get wrong: the unit a
 * figure was computed in, the boundary the worst case sits on, and the fact
 * that a hand-picked scenario is allowed to be less plausible than the radius
 * and far milder than the systematic one at the same time.
 */

import { ComponentFixture, TestBed } from '@angular/core/testing';

import { STALE_RESULT_BADGE } from '../../../../models/stress-testing.model';
import { StressTestingService } from '../../../../services/stress-testing.service';
import { ScenarioSummary } from './scenario-summary';

describe('ScenarioSummary', () => {
  let fixture: ComponentFixture<ScenarioSummary>;
  let host: HTMLElement;
  let service: StressTestingService;

  beforeEach(async () => {
    await TestBed.configureTestingModule({ imports: [ScenarioSummary] }).compileComponents();

    fixture = TestBed.createComponent(ScenarioSummary);
    host = fixture.nativeElement;
    service = TestBed.inject(StressTestingService);
    document.body.appendChild(host);
    fixture.detectChanges();
  });

  afterEach(() => {
    host.remove();
  });

  function byTestId(id: string): HTMLElement | null {
    return host.querySelector(`[data-testid="${id}"]`);
  }

  function text(id: string): string {
    return byTestId(id)?.textContent?.trim() ?? '';
  }

  function headings(): string[] {
    return Array.from(host.querySelectorAll('h3')).map((h) => h.textContent?.trim() ?? '');
  }

  async function evaluateEquityCrash(): Promise<void> {
    service.setFactorFixed('equity', true);
    service.setFactorValue('equity', -18);
    await service.evaluateManual();
    fixture.detectChanges();
  }

  // --- the empty state -------------------------------------------------------

  it('when nothing has been run, only the expected card carries a figure', () => {
    expect(text('expected-cep')).toBe('+4.2% RWA');
    expect(byTestId('manual-placeholder')).not.toBeNull();
    expect(byTestId('worst-case-placeholder')).not.toBeNull();
    expect(byTestId('manual-maha')).toBeNull();
    expect(byTestId('worst-case-maha')).toBeNull();
  });

  it('when nothing has been run, the worst-case card still names the radius it would search', () => {
    expect(headings()[2]).toBe('Worst-case scenario — Ell_k, k = 5.00');

    service.setK(7);
    fixture.detectChanges();
    expect(headings()[2]).toBe('Worst-case scenario — Ell_k, k = 7.00');
  });

  // --- populated -------------------------------------------------------------

  it('when the worst-case search has run, the card reads the worked example', async () => {
    await service.runWorstCase();
    fixture.detectChanges();

    expect(text('worst-case-maha')).toContain('5.00');
    expect(text('worst-case-maha')).toContain('(boundary)');
    expect(text('worst-case-cep')).toBe('−2.4% RWA');
    expect(text('worst-case-loss')).toBe('−6.6 pts');
    expect(byTestId('boundary-note')?.textContent).toContain('Maha(r_WC) = k');
  });

  it('when the hand-picked scenario has been evaluated, it is milder and less plausible than the worst case', async () => {
    await evaluateEquityCrash();
    service.setFactorFixed('equity', false);
    await service.runWorstCase();
    fixture.detectChanges();

    expect(text('manual-maha')).toBe('5.42');
    expect(text('manual-cep')).toBe('+1.1% RWA');
    expect(text('manual-loss')).toBe('−3.1 pts');

    // The whole argument of the page, on one row of two cards: a *less*
    // plausible hand-picked move costs less than the systematic search finds.
    expect(Number(text('manual-maha'))).toBeGreaterThan(5);
    expect(text('worst-case-loss')).toBe('−6.6 pts');
  });

  it('when the hand-picked scenario is outside Ell_k, the card says so rather than hiding it', async () => {
    await evaluateEquityCrash();

    expect(byTestId('manual-outside')?.textContent).toContain('outside Ell_k');
    expect(host.querySelector('h3:nth-of-type(1)')).not.toBeNull();
    expect(headings()[1]).toContain('Manual scenario — Equity market −18.0%');
  });

  // --- the central rule ------------------------------------------------------

  it('when the radius moves, every populated card is badged and no figure changes', async () => {
    await service.runWorstCase();
    fixture.detectChanges();
    const cep = text('worst-case-cep');

    service.setK(9);
    fixture.detectChanges();

    expect(text('worst-case-cep')).toBe(cep);
    expect(byTestId('worst-case-stale')?.textContent).toContain(STALE_RESULT_BADGE);
    expect(byTestId('expected-stale')?.textContent).toContain(STALE_RESULT_BADGE);
    // The card keeps naming the radius it was computed at, not the new one.
    expect(host.textContent).toContain('Computed at k = 5.00');
  });

  it('when the impact measure moves, each card keeps the unit its own figure was computed in', async () => {
    await service.runWorstCase();
    service.setImpactMeasure('economic-capital');
    fixture.detectChanges();

    expect(text('worst-case-cep')).toBe('−2.4% RWA');
    expect(text('expected-cep')).toBe('+4.2% RWA');
    expect(service.measureUnit()).toBe('% EC');
  });

  it('when the search is re-run under the new measure, both the figures and the unit follow it', async () => {
    await service.runWorstCase();
    service.setImpactMeasure('asset-values');
    await service.runWorstCase();
    fixture.detectChanges();

    expect(byTestId('worst-case-stale')).toBeNull();
    expect(text('worst-case-cep')).toContain('% NAV');
    expect(text('expected-cep')).toBe('+2.6% NAV');
  });

  // --- loading ---------------------------------------------------------------

  it('while a manual evaluation runs, only that card is a placeholder', async () => {
    service.setFactorFixed('equity', true);
    service.setFactorValue('equity', -18);
    const pending = service.evaluateManual();
    fixture.detectChanges();

    expect(byTestId('manual-skeleton')?.getAttribute('aria-busy')).toBe('true');
    expect(byTestId('worst-case-skeleton')).toBeNull();
    expect(text('expected-cep')).toBe('+4.2% RWA');

    await pending;
    fixture.detectChanges();
    expect(byTestId('manual-skeleton')).toBeNull();
  });

  it('while the worst-case search runs, only that card is a placeholder', async () => {
    const pending = service.runWorstCase();
    fixture.detectChanges();

    expect(byTestId('worst-case-skeleton')?.getAttribute('aria-busy')).toBe('true');
    expect(byTestId('manual-skeleton')).toBeNull();

    await pending;
    fixture.detectChanges();
    expect(byTestId('worst-case-skeleton')).toBeNull();
  });
});
