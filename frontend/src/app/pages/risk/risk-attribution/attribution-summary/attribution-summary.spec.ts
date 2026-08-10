/**
 * Region 2 — the four headline figures.
 *
 * Two things are load-bearing here and both are tested rather than assumed:
 *
 * - switching to the with-without method must drop the coverage below 100% and
 *   say so. A page that silently rescaled the contributions back to full
 *   allocation would be showing RORAC-incompatible numbers under a badge
 *   claiming coherence;
 * - the sub-additivity copy must depend on the *measure*. VaR is not
 *   sub-additive, so a page that always explains `DI > 1` as a data anomaly
 *   would file a real concentration finding as a bug.
 */

import { ComponentFixture, TestBed } from '@angular/core/testing';

import { RiskAttributionService } from '../../../../services/risk-attribution.service';
import { AttributionSummary } from './attribution-summary';

describe('AttributionSummary', () => {
  let fixture: ComponentFixture<AttributionSummary>;
  let host: HTMLElement;
  let service: RiskAttributionService;

  beforeEach(async () => {
    await TestBed.configureTestingModule({ imports: [AttributionSummary] }).compileComponents();
    fixture = TestBed.createComponent(AttributionSummary);
    host = fixture.nativeElement;
    service = TestBed.inject(RiskAttributionService);
    fixture.detectChanges();
  });

  function values(): string[] {
    return Array.from(host.querySelectorAll('[data-testid="metric-value"]')).map((el) =>
      (el.textContent ?? '').trim(),
    );
  }

  function notes(): string[] {
    return Array.from(host.querySelectorAll('[data-testid="metric-note"]')).map((el) =>
      (el.textContent ?? '').trim(),
    );
  }

  function summaryNote(id: string): string {
    return host.querySelector(`[data-summary-note="${id}"]`)?.textContent ?? '';
  }

  function labelled(term: string): HTMLElement | null {
    return (
      Array.from(host.querySelectorAll('dt')).find((dt) => dt.textContent?.trim() === term)
        ?.parentElement ?? null
    );
  }

  // --- the wireframe's row --------------------------------------------------

  it('when the row renders, it prints the four figures the wireframe draws', () => {
    expect(values()).toEqual(['$4,182,300', '100.0%', '0.72', 'Euler (coherent)']);
  });

  it('when the row renders, the total is labelled with the active measure', () => {
    expect(notes()[0]).toBe('σ(X) · Volatility');
  });

  it('when the measure has a confidence level, the total names it too', async () => {
    await service.setMeasure('es');
    fixture.detectChanges();

    expect(notes()[0]).toBe('ES_α(X) · ES at 95%');
  });

  it('when the row renders, DI is read in words as well as as a number', () => {
    expect(notes()[2]).toContain('moderate');
    expect(notes()[2]).toContain('+28.0%');
  });

  it('when the row renders, the four terms are a description list', () => {
    expect(labelled('Total risk (EC)')).not.toBeNull();
    expect(labelled('Sum of contributions')).not.toBeNull();
    expect(labelled('Portfolio DI')).not.toBeNull();
    expect(labelled('Allocation rule')).not.toBeNull();
  });

  // --- full allocation, and the refusal to fake it --------------------------

  it('when the method is Euler, the coverage is 100% under a full-allocation badge', () => {
    expect(values()[1]).toBe('100.0%');
    expect(host.textContent).toContain('Full allocation');
    expect(summaryNote('method')).toContain('sum to EC exactly');
  });

  it('when the method is Marginal, the coverage drops below 100% and is not rescaled', async () => {
    await service.setMethod('marginal');
    fixture.detectChanges();

    expect(values()[1]).toBe('97.6%');
    expect(values()[1]).not.toBe('100.0%');
    expect(host.textContent).toContain('Below full allocation');
  });

  it('when the method is Marginal, the badge says why the contributions fall short', async () => {
    await service.setMethod('marginal');
    fixture.detectChanges();

    expect(summaryNote('method')).toContain(
      'do not satisfy the full allocation property',
    );
    expect(summaryNote('method')).toContain('shown unrescaled');
    expect(values()[3]).toBe('Marginal (with-without)');
  });

  it('when the method changes, the allocation-rule badge changes with it', async () => {
    expect(values()[3]).toBe('Euler (coherent)');

    await service.setMethod('marginal');
    fixture.detectChanges();
    expect(values()[3]).toBe('Marginal (with-without)');

    await service.setMethod('euler');
    fixture.detectChanges();
    expect(values()[3]).toBe('Euler (coherent)');
  });

  // --- sub-additivity, per measure -----------------------------------------

  it('when the measure is sub-additive, the note says DI ≤ 1 holds by construction', () => {
    expect(summaryNote('subadditivity')).toContain('Sub-additive');
    expect(summaryNote('subadditivity')).toContain('DI ≤ 1 by construction');
  });

  it('when the measure is VaR, the note calls a DI above 1 a concentration signal, not a data error', async () => {
    await service.setMeasure('var');
    fixture.detectChanges();

    expect(summaryNote('subadditivity')).toContain('Not sub-additive');
    expect(summaryNote('subadditivity')).toContain('concentration signal, not a data error');
    expect(summaryNote('subadditivity')).not.toContain('DI ≤ 1 by construction');
  });

  it('when the measure is ES, the sub-additive reading comes back', async () => {
    await service.setMeasure('es');
    fixture.detectChanges();

    expect(summaryNote('subadditivity')).toContain('Sub-additive');
    expect(summaryNote('subadditivity')).toContain('DI ≤ 1 by construction');
  });

  it('whichever measure is on screen, DI is shown rather than hidden', async () => {
    for (const measure of ['var', 'es'] as const) {
      await service.setMeasure(measure);
      fixture.detectChanges();
      expect(values()[2]).toMatch(/^\d\.\d\d$/);
      expect(Number(values()[2])).toBeLessThanOrEqual(1);
    }
  });

  // --- the two qualifying badges --------------------------------------------

  it('when the snapshot is not the latest, a badge and a note say so in words', async () => {
    await service.setSnapshot('2026-06-30');
    fixture.detectChanges();

    expect(host.textContent).toContain('Snapshot not current');
    expect(summaryNote('stale')).toContain('may have been rebalanced');
  });

  it('when the tail is too thin for the confidence level, an uncertainty badge appears', async () => {
    await service.setMeasure('var');
    await service.setConfidence(99);
    fixture.detectChanges();

    expect(host.textContent).toContain('High estimation uncertainty');
    expect(summaryNote('uncertainty')).toContain('1260 observations');
    expect(summaryNote('uncertainty')).toContain('5000');
  });

  it('when the sample is long enough for the level, no uncertainty badge is shown', async () => {
    await service.setMeasure('var');
    fixture.detectChanges();

    expect(host.querySelector('[data-summary-note="uncertainty"]')).toBeNull();
    expect(host.textContent).not.toContain('High estimation uncertainty');
  });

  // --- loading --------------------------------------------------------------

  it('while a recompute runs, placeholders stand in at the height of the row', async () => {
    const pending = service.recompute(false, 'measure');
    fixture.detectChanges();

    const skeleton = host.querySelector('[data-testid="summary-skeleton"]');
    expect(skeleton).not.toBeNull();
    expect(skeleton?.getAttribute('aria-busy')).toBe('true');
    expect(host.querySelector('[data-testid="metric-value"]')).toBeNull();

    await pending;
  });
});
