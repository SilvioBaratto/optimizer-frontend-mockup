/**
 * The PC1 loadings table: the filter, the two sorts, and the invariant the
 * contribution column carries — it is a share of I1 and it sums to one over the
 * universe, whatever the filter is showing.
 */

import { ComponentFixture, TestBed } from '@angular/core/testing';

import { TurbulenceService } from '../../../../services/turbulence.service';
import { Pc1ContributionTable } from './pc1-contribution-table';

describe('Pc1ContributionTable', () => {
  let fixture: ComponentFixture<Pc1ContributionTable>;
  let host: HTMLElement;
  let service: TurbulenceService;

  beforeEach(async () => {
    await TestBed.configureTestingModule({ imports: [Pc1ContributionTable] }).compileComponents();

    fixture = TestBed.createComponent(Pc1ContributionTable);
    host = fixture.nativeElement;
    service = TestBed.inject(TurbulenceService);
    document.body.appendChild(host);
    fixture.detectChanges();
  });

  afterEach(() => {
    host.remove();
  });

  function rows(): HTMLTableRowElement[] {
    return Array.from(host.querySelectorAll('tbody tr'));
  }

  function assets(): string[] {
    return rows().map((row) => (row.querySelector('th span span')?.textContent ?? '').trim());
  }

  function search(value: string): void {
    const input = host.querySelector('input[type="search"]') as HTMLInputElement;
    input.value = value;
    input.dispatchEvent(new Event('input'));
    fixture.detectChanges();
  }

  function header(column: string): HTMLTableCellElement {
    return host.querySelector(`[data-testid="pc1-sort-${column}"]`)?.closest('th') as HTMLTableCellElement;
  }

  it('when the table renders, five rows are shown ordered by the size of the loading', () => {
    expect(rows().length).toBe(5);
    expect(assets()[0]).toBe('HY_CREDIT');
    expect(header('weight').getAttribute('aria-sort')).toBe('descending');
    expect(host.textContent).toContain('… 19 more assets');
  });

  it('when the table renders, the contribution column is a share of I1 that sums to one', () => {
    const total = service
      .pc1Weights()
      .reduce((sum, row) => sum + row.contributionToI1, 0);
    expect(total).toBeCloseTo(1, 10);
    expect(rows()[0].querySelectorAll('td')[1].textContent?.trim()).toMatch(/^\d+\.\d%$/);
  });

  it('when a negative loading is large, it is ranked by size rather than by sign', () => {
    (host.querySelector('[data-testid="pc1-expand"]') as HTMLButtonElement).click();
    fixture.detectChanges();

    const weights = service.pc1Weights().map((row) => Math.abs(row.weight));
    for (let i = 1; i < weights.length; i++) {
      expect(weights[i - 1]).toBeGreaterThanOrEqual(weights[i]);
    }
    const negative = service.pc1Weights().findIndex((row) => row.weight < 0);
    expect(negative).toBeGreaterThan(0);
    expect(negative).toBeLessThan(service.pc1Weights().length - 1);
  });

  it('when the filter narrows the table, the count says how many of how many', () => {
    search('credit');
    fixture.detectChanges();

    expect(assets().every((asset) => asset.includes('CREDIT') || asset.includes('MBS'))).toBe(true);
    expect(host.querySelector('[data-testid="filter-chip-bar-count"]')?.textContent).toContain(
      'of 24',
    );
  });

  it('when the filter matches nothing, the table says so and offers the way back', () => {
    search('zzz');

    expect(host.querySelector('table')).toBeNull();
    expect(host.querySelector('[role="status"]')?.textContent).toContain('clear the filter');
  });

  it('when the filter narrows the table, nothing derived from the eigenvector moves', () => {
    const participation = service.participation();
    const weights = service.pc1WeightsAll();

    search('gov');

    expect(service.participation()).toEqual(participation);
    expect(service.pc1WeightsAll()).toEqual(weights);
  });

  it('when the sort control is used, the header follows it and the table reorders', () => {
    const select = host.querySelector('[data-testid="pc1-sort"]') as HTMLSelectElement;
    select.value = 'asset';
    select.dispatchEvent(new Event('change'));
    fixture.detectChanges();

    expect(assets()[0]).toBe('EQ_ASIA_PAC');
    expect(header('asset').getAttribute('aria-sort')).toBe('ascending');
    expect(header('weight').getAttribute('aria-sort')).toBe('none');
  });

  it('when the computation fails, the panel says the first eigenvector is unavailable', async () => {
    await service.refreshPanel('pc1-contribution', true);
    fixture.detectChanges();

    expect(host.querySelector('table')).toBeNull();
    expect(host.textContent).toContain('The PC1 weights could not be computed.');
  });
});
