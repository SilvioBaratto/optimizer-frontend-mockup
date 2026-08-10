/**
 * The contributors table: the decomposition of the current score by asset,
 * ordered from two controls that cannot disagree, with the preview the
 * wireframe draws.
 */

import { ComponentFixture, TestBed } from '@angular/core/testing';

import { TurbulenceService } from '../../../../services/turbulence.service';
import { ContributorsTable } from './contributors-table';

describe('ContributorsTable', () => {
  let fixture: ComponentFixture<ContributorsTable>;
  let host: HTMLElement;
  let service: TurbulenceService;

  beforeEach(async () => {
    await TestBed.configureTestingModule({ imports: [ContributorsTable] }).compileComponents();

    fixture = TestBed.createComponent(ContributorsTable);
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

  function cells(index: number): string[] {
    return Array.from(rows()[index].querySelectorAll('td')).map((cell) =>
      (cell.textContent ?? '').trim(),
    );
  }

  function header(column: string): HTMLTableCellElement {
    const button = host.querySelector(`[data-testid="sort-${column}"]`);
    return button?.closest('th') as HTMLTableCellElement;
  }

  it('when the table renders, five rows are shown with the rest a click away', () => {
    expect(rows().length).toBe(5);
    expect(host.textContent).toContain('… 19 more assets');
  });

  it('when the table renders, it is ordered by the magnitude of the z-score', () => {
    expect(assets()).toEqual(['HY_CREDIT', 'EQ_EM', 'EQ_US_LARGE', 'IG_CREDIT', 'GOV_10Y']);
    // A large negative move is a large move: it outranks every smaller one.
    expect(cells(4)[0]).toBe('−0.86');
  });

  it('when the table renders, the contributions are the shares the wireframe prints', () => {
    expect(rows().map((_, index) => cells(index)[1])).toEqual([
      '32.1%',
      '24.1%',
      '19.0%',
      '11.0%',
      '8.0%',
    ]);
    const total = service.contributors().reduce((sum, row) => sum + row.contribution, 0);
    expect(total).toBeCloseTo(1, 10);
  });

  it('when the table renders, only the active column announces a sort direction', () => {
    expect(header('abs-z').getAttribute('aria-sort')).toBe('descending');
    expect(header('asset').getAttribute('aria-sort')).toBe('none');
    expect(header('contribution').getAttribute('aria-sort')).toBe('none');
  });

  it('when a column header is used, the table reorders and the select follows it', () => {
    (host.querySelector('[data-testid="sort-asset"]') as HTMLButtonElement).click();
    fixture.detectChanges();

    expect(assets()[0]).toBe('EQ_ASIA_PAC');
    expect(header('asset').getAttribute('aria-sort')).toBe('ascending');
    expect((host.querySelector('[data-testid="contributor-sort"]') as HTMLSelectElement).value).toBe(
      'asset',
    );
  });

  it('when the select is used, the table reorders and the header follows it', () => {
    const select = host.querySelector('[data-testid="contributor-sort"]') as HTMLSelectElement;
    select.value = 'contribution';
    select.dispatchEvent(new Event('change'));
    fixture.detectChanges();

    expect(assets()[0]).toBe('HY_CREDIT');
    expect(header('contribution').getAttribute('aria-sort')).toBe('descending');
  });

  it('when the full table is asked for, every asset is shown and the control offers the way back', () => {
    const button = host.querySelector('[data-testid="contributors-expand"]') as HTMLButtonElement;
    button.click();
    fixture.detectChanges();

    expect(rows().length).toBe(24);
    expect(button.getAttribute('aria-expanded')).toBe('true');
    expect(button.textContent?.trim()).toBe('Show top 5');
  });

  it('when an asset is short of the window, its row is marked and its figure stays', () => {
    service.selectUniverse('multi-asset-24-rebuilt');
    (host.querySelector('[data-testid="contributors-expand"]') as HTMLButtonElement).click();
    fixture.detectChanges();

    const short = rows().find((row) => (row.textContent ?? '').includes('EQ_ASIA_PAC'));
    expect(short?.textContent).toContain('short history');
    expect(short?.querySelectorAll('td')[0].textContent?.trim()).toBe('0.35');
    expect(host.querySelector('[data-testid="partial-coverage"]')?.textContent).toContain(
      'Partial coverage — 21/24 assets',
    );
  });

  it('when the computation fails, the panel shows its own fault instead of the table', async () => {
    await service.refreshPanel('contributors', true);
    fixture.detectChanges();

    expect(host.querySelector('table')).toBeNull();
    expect(host.textContent).toContain('The per-asset decomposition of d_t could not be computed.');
  });
});
