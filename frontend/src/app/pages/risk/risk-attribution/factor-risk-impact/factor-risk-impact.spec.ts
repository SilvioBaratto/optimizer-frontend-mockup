/**
 * Region 5 — the systematic factor risk impact.
 *
 * Two claims are tested. The panel's own Group by and its own Export are
 * independent of the toolbar: neither recomputes anything and neither moves the
 * table's grouping. And the residual is a *row* — the unexplained share is
 * shown as a number with a word, not left as the gap between the bars and 100%.
 */

import { ComponentFixture, TestBed } from '@angular/core/testing';

import { RiskAttributionService } from '../../../../services/risk-attribution.service';
import { FactorRiskImpact } from './factor-risk-impact';

describe('FactorRiskImpact', () => {
  let fixture: ComponentFixture<FactorRiskImpact>;
  let host: HTMLElement;
  let service: RiskAttributionService;

  beforeEach(async () => {
    await TestBed.configureTestingModule({ imports: [FactorRiskImpact] }).compileComponents();
    fixture = TestBed.createComponent(FactorRiskImpact);
    host = fixture.nativeElement;
    service = TestBed.inject(RiskAttributionService);
    fixture.detectChanges();
  });

  function rows(): HTMLElement[] {
    return Array.from(host.querySelectorAll('[data-factor]'));
  }

  function names(): string[] {
    return rows().map((row) => row.querySelector('span')?.textContent?.trim() ?? '');
  }

  function reading(id: string): string {
    return host.querySelector(`[data-factor="${id}"]`)?.textContent ?? '';
  }

  function view(): HTMLSelectElement {
    return host.querySelector('#factor-impact-view') as HTMLSelectElement;
  }

  // --- the ranking ----------------------------------------------------------

  it('when the panel renders, the factors are ranked with the residual last', () => {
    expect(names()).toEqual(['Equity beta', 'Rates', 'Credit spread', 'Residual']);
  });

  it('when the panel renders, every bar carries its percentage as text', () => {
    expect(reading('equity-beta')).toContain('62.0%');
    expect(reading('rates')).toContain('21.0%');
    expect(reading('credit')).toContain('9.0%');
    expect(reading('residual')).toContain('8.0%');
  });

  it('when the panel renders, the residual row is labelled as unexplained', () => {
    expect(reading('residual')).toContain('unexplained');
    expect(host.textContent).toContain('Listed factors explain');
    expect(host.textContent).toContain('92.0%');
  });

  it('when the panel renders, it states what the impact figure is', () => {
    expect(host.textContent).toContain('RI_ρ(L|S)');
    expect(host.textContent).toContain('generalisation of R²');
  });

  // --- its own group-by -----------------------------------------------------

  it('when the panel’s own grouping changes, the factors roll up without recomputing', () => {
    const spy = vi.spyOn(service, 'recompute');

    view().value = 'factor-group';
    view().dispatchEvent(new Event('change'));
    fixture.detectChanges();

    expect(names()).toEqual(['Market', 'Fixed income', 'Residual']);
    expect(reading('market')).toContain('62.0%');
    expect(reading('fixed-income')).toContain('30.0%');
    expect(spy).not.toHaveBeenCalled();
  });

  it('when the panel’s own grouping changes, the toolbar’s grouping is left alone', () => {
    view().value = 'factor-group';
    view().dispatchEvent(new Event('change'));
    fixture.detectChanges();

    expect(service.grouping()).toBe('asset');
  });

  it('when the toolbar groups by something else, the panel stays on the factor book', async () => {
    await service.setGrouping('sub-portfolio');
    fixture.detectChanges();

    expect(names()).toEqual(['Equity beta', 'Rates', 'Credit spread', 'Residual']);
  });

  it('when the toolbar groups by factor, the panel shows the same numbers as the table', async () => {
    await service.setGrouping('factor');
    fixture.detectChanges();

    const tableShares = service.rows().map((row) => row.eulerShare);
    const panelShares = service.factorImpacts().map((row) => row.impact);
    expect(panelShares).toEqual(tableShares);
    expect(reading('equity-beta')).toContain('62.0%');
  });

  // --- its own export -------------------------------------------------------

  it('when the panel is exported, its own confirmation names its own view', () => {
    Array.from(host.querySelectorAll('button'))
      .find((b) => b.textContent?.trim() === 'Export')!
      .click();
    fixture.detectChanges();

    const status = host.querySelector('[data-testid="factor-export-status"]')!;
    expect(status.getAttribute('role')).toBe('status');
    expect(status.textContent).toContain('4 rows');
    expect(status.textContent).toContain('factor risk impact by factor');
    expect(status.textContent).toContain('2026-07-31');
  });

  // --- loading --------------------------------------------------------------

  it('while a recompute runs, placeholder bars stand in for the panel', async () => {
    const pending = service.recompute(false, 'measure');
    fixture.detectChanges();

    const skeleton = host.querySelector('[data-testid="factor-skeleton"]');
    expect(skeleton?.getAttribute('aria-busy')).toBe('true');
    expect(host.querySelector('[data-factor]')).toBeNull();

    await pending;
  });
});
