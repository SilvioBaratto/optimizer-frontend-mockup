/**
 * Region 3 — the decomposition table.
 *
 * The header contract follows the idiom doc 15 established and is re-tested
 * here rather than trusted: `aria-sort` on the `<th>`, a real `<button>` inside
 * it, one direction at a time.
 *
 * The rest guards the four rules that keep the table honest — the TOTAL row
 * survives pagination and the search, a hedge is a glyph *and* a word, RORAC on
 * a non-positive contribution is a dash with a reason, and the `$ / %` switch
 * reformats without moving a single figure.
 */

import { ComponentFixture, TestBed } from '@angular/core/testing';

import { ICON_PROVIDER } from '../../../../icons';
import { RiskAttributionService } from '../../../../services/risk-attribution.service';
import { ContributionTable } from './contribution-table';

describe('ContributionTable', () => {
  let fixture: ComponentFixture<ContributionTable>;
  let host: HTMLElement;
  let service: RiskAttributionService;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [ContributionTable],
      providers: [ICON_PROVIDER],
    }).compileComponents();
    fixture = TestBed.createComponent(ContributionTable);
    host = fixture.nativeElement;
    service = TestBed.inject(RiskAttributionService);
    document.body.appendChild(host);
    fixture.detectChanges();
  });

  afterEach(() => host.remove());

  function headers(): HTMLTableCellElement[] {
    return Array.from(host.querySelectorAll('thead th'));
  }

  function headerNamed(label: string): HTMLTableCellElement {
    const match = headers().find((th) => (th.textContent ?? '').trim().startsWith(label));
    expect(match).toBeTruthy();
    return match as HTMLTableCellElement;
  }

  function rowButtons(): HTMLButtonElement[] {
    return Array.from(host.querySelectorAll('[data-row]'));
  }

  function rowIds(): string[] {
    return rowButtons().map((b) => b.getAttribute('data-row') ?? '');
  }

  function cells(id: string): string[] {
    const row = host.querySelector(`[data-row="${id}"]`)!.closest('tr')!;
    return Array.from(row.querySelectorAll('td')).map((td) => (td.textContent ?? '').trim());
  }

  function totalCells(): string[] {
    const row = host.querySelector('[data-testid="attribution-total-row"]')!;
    return Array.from(row.querySelectorAll('td')).map((td) => (td.textContent ?? '').trim());
  }

  /** 26 rows on one page, so a test can reach the last of them. */
  function showAllRows(): void {
    const size = host.querySelector('#attribution-page-size') as HTMLSelectElement;
    size.value = '50';
    size.dispatchEvent(new Event('change'));
    fixture.detectChanges();
  }

  function pageButton(label: string): HTMLButtonElement {
    const match = Array.from(host.querySelectorAll('button')).find(
      (b) => b.getAttribute('aria-label') === label,
    );
    expect(match).toBeTruthy();
    return match as HTMLButtonElement;
  }

  // --- sortable headers -----------------------------------------------------

  it('when the table renders, every column carries an aria-sort state', () => {
    const sortable = headers().filter((th) => th.hasAttribute('aria-sort'));
    expect(sortable).toHaveLength(8);
    for (const th of sortable) {
      expect(['ascending', 'descending', 'none']).toContain(th.getAttribute('aria-sort'));
    }
  });

  it('when the table renders, the sort control inside a header is a real button', () => {
    const control = headerNamed('Component').querySelector('button');
    expect(control?.tagName).toBe('BUTTON');
  });

  it('when the table renders in book order, no column claims a direction', () => {
    const directional = headers().filter((th) =>
      ['ascending', 'descending'].includes(th.getAttribute('aria-sort') ?? ''),
    );
    expect(directional).toEqual([]);
  });

  it('when a header is activated, only that column carries a direction', () => {
    headerNamed('Stand-alone').querySelector('button')!.click();
    fixture.detectChanges();

    expect(headerNamed('Stand-alone').getAttribute('aria-sort')).toBe('ascending');
    expect(headerNamed('Component').getAttribute('aria-sort')).toBe('none');
    expect(headerNamed('Weight').getAttribute('aria-sort')).toBe('none');
  });

  it('when the same header is activated twice, the direction flips', () => {
    headerNamed('Weight').querySelector('button')!.click();
    fixture.detectChanges();
    expect(headerNamed('Weight').getAttribute('aria-sort')).toBe('ascending');

    headerNamed('Weight').querySelector('button')!.click();
    fixture.detectChanges();
    expect(headerNamed('Weight').getAttribute('aria-sort')).toBe('descending');
  });

  it('when a header is activated, the rows are actually reordered', () => {
    const before = rowIds();
    headerNamed('Component').querySelector('button')!.click();
    fixture.detectChanges();

    const after = rowIds();
    expect(after).not.toEqual(before);
    expect(after[0]).toBe('AAPL');
    expect([...after]).toEqual([...after].sort());
  });

  it('when a column with undefined values is sorted, the dashes go last in both directions', () => {
    showAllRows();

    headerNamed('RORAC').querySelector('button')!.click();
    fixture.detectChanges();
    expect(rowIds().slice(-3).sort()).toEqual(['CASH', 'GLD', 'TLT']);

    headerNamed('RORAC').querySelector('button')!.click();
    fixture.detectChanges();
    expect(rowIds().slice(-3).sort()).toEqual(['CASH', 'GLD', 'TLT']);
  });

  // --- the wireframe's worked example ---------------------------------------

  it('when the table renders, AAPL reads exactly as the wireframe draws it', () => {
    expect(cells('AAPL')).toEqual([
      '8.2%',
      '$612,000',
      '$395,194',
      '$421,300',
      '10.1%',
      '14.2%',
      '0.69',
    ]);
  });

  it('when the table renders, MSFT carries its contribution and share', () => {
    const row = cells('MSFT');
    expect(row[3]).toBe('$402,100');
    expect(row[4]).toBe('9.6%');
  });

  // --- both allocation principles, side by side ------------------------------

  it('when the table renders, every row prints the with-without figure beside the Euler one', () => {
    expect(headerNamed('Marginal (w/o)')).toBeTruthy();
    expect(headerNamed('Euler contrib.')).toBeTruthy();

    // The inequality the page exists to demonstrate, on every row at once.
    for (const row of service.rows()) {
      expect(row.marginal).toBeLessThanOrEqual(row.euler);
    }
    expect(cells('AAPL')[2]).toBe('$395,194');
    expect(cells('AAPL')[3]).toBe('$421,300');
  });

  it('when the method is Euler, the Euler column is the principal one and says so', () => {
    expect(headerNamed('Euler contrib.').textContent).toContain('principal column');
    expect(headerNamed('Marginal (w/o)').textContent).not.toContain('principal column');
  });

  it('when the method becomes Marginal, the principal column moves without either column leaving', async () => {
    await service.setMethod('marginal');
    fixture.detectChanges();

    expect(headerNamed('Marginal (w/o)').textContent).toContain('principal column');
    expect(headerNamed('Euler contrib.').textContent).not.toContain('principal column');
    // Both figures are still on the row.
    expect(cells('AAPL')[2]).toBe('$395,194');
    expect(cells('AAPL')[3]).toBe('$421,300');
  });

  // --- hedges ---------------------------------------------------------------

  it('when a component reduces total risk, the row is marked with a glyph and the word', () => {
    const button = host.querySelector('[data-row="TLT"]')!;
    expect(button.textContent).toContain('▼');
    expect(button.textContent).toContain('hedge');
    expect(cells('TLT')[3]).toBe('-$31,500');
    expect(cells('TLT')[4]).toBe('-0.8%');
  });

  it('when a component reduces total risk, the hedge is explained in words to assistive tech', () => {
    expect(host.querySelector('[data-row="TLT"]')?.textContent).toContain(
      'the position reduces total risk',
    );
  });

  // --- undefined cells ------------------------------------------------------

  it('when the contribution is negative, RORAC and the marginal DI are dashes, not numbers', () => {
    const row = cells('TLT');
    expect(row[5]).toContain('—');
    expect(row[5]).not.toMatch(/\d/);
    expect(row[6]).toContain('—');
    expect(row[6]).not.toMatch(/\d/);
  });

  it('when the contribution is zero, RORAC is a dash with the reason attached', () => {
    showAllRows();
    const row = cells('CASH');
    expect(row[5]).toContain('—');
    expect(row[5]).toContain('RORAC is undefined for a zero or negative risk contribution');
  });

  it('when a component earns a return on a negative contribution, RORAC is still undefined', () => {
    // GLD carries an expected P&L and a negative Euler contribution: the ratio
    // would print a plausible-looking number for a return on no capital.
    expect(cells('GLD')[5]).toContain('—');
  });

  // --- the TOTAL row --------------------------------------------------------

  it('when the table renders, the TOTAL row carries the sums the wireframe prints', () => {
    expect(totalCells().slice(0, 6)).toEqual([
      '100.0%',
      '$5,808,800',
      '$4,083,807',
      '$4,182,300',
      '100.0%',
      '9.8%',
    ]);
  });

  it('when the table renders, the TOTAL row shows Σ marginal falling short of EC', () => {
    // Σ ρ_marg(X_i|X) < ρ(X): the with-without shortfall, printed rather than
    // rescaled away.
    expect(service.sumMarginal()).toBeLessThan(service.economicCapital());
    expect(totalCells()[2]).not.toBe(totalCells()[3]);
  });

  it('when the table renders, the TOTAL row has no marginal DI to show', () => {
    expect(totalCells()[6]).toContain('—');
    expect(totalCells()[6]).toContain('has no total');
  });

  it('when the reader pages forward, the TOTAL row is still on screen and unchanged', () => {
    const before = totalCells();
    expect(rowButtons()).toHaveLength(25);

    pageButton('Page 2').click();
    fixture.detectChanges();

    expect(rowButtons()).toHaveLength(1);
    expect(host.querySelector('[data-testid="attribution-total-row"]')).not.toBeNull();
    expect(totalCells()).toEqual(before);
  });

  it('when the search narrows the table, the TOTAL row stays whole-book', () => {
    const before = totalCells();
    service.search.set('AAPL');
    fixture.detectChanges();

    expect(rowButtons()).toHaveLength(1);
    expect(totalCells()).toEqual(before);
  });

  // --- pagination -----------------------------------------------------------

  it('when the page size is reduced, the number of pages follows', () => {
    const size = host.querySelector('#attribution-page-size') as HTMLSelectElement;
    size.value = '10';
    size.dispatchEvent(new Event('change'));
    fixture.detectChanges();

    expect(rowButtons()).toHaveLength(10);
    expect(host.querySelectorAll('nav[aria-label="Pagination"] li')).toHaveLength(5);
  });

  it('when a search empties the last page, the table falls back to a page that exists', () => {
    pageButton('Page 2').click();
    fixture.detectChanges();
    expect(rowButtons()).toHaveLength(1);

    service.search.set('A');
    fixture.detectChanges();

    expect(rowButtons().length).toBeGreaterThan(0);
    expect(host.querySelector('[aria-current="page"]')?.textContent?.trim()).toBe('1');
  });

  // --- the display switch reformats, it does not recompute -------------------

  it('when the display switches to %, the figures are the same risk over net asset value', () => {
    const spy = vi.spyOn(service, 'recompute');
    service.displayUnit.set('percent');
    fixture.detectChanges();

    // 612,000, 395,194 and 421,300 over a 30,000,000 book.
    expect(cells('AAPL').slice(0, 5)).toEqual(['8.2%', '2.0%', '1.3%', '1.4%', '10.1%']);
    expect(totalCells()[3]).toBe('13.9%');
    expect(spy).not.toHaveBeenCalled();
  });

  // --- the method owns the principal column ----------------------------------

  it('when the method becomes Marginal, the share column and the sum check follow it', async () => {
    expect(headerNamed('Euler %')).toBeTruthy();

    await service.setMethod('marginal');
    fixture.detectChanges();

    expect(headerNamed('Marginal %')).toBeTruthy();
    // The with-without figures are below the Euler ones, and are not rescaled.
    expect(cells('AAPL')[4]).toBe('9.4%');
    expect(totalCells()[4]).toBe('97.6%');
  });

  it('when the method becomes Marginal, the marginal DI column stays Euler-based', async () => {
    const before = cells('AAPL')[6];
    await service.setMethod('marginal');
    fixture.detectChanges();

    expect(cells('AAPL')[6]).toBe(before);
  });

  // --- grouping -------------------------------------------------------------

  it('when the grouping changes, the first two column headers change with it', async () => {
    await service.setGrouping('factor');
    fixture.detectChanges();

    expect(headerNamed('Factor')).toBeTruthy();
    expect(headerNamed('Exposure')).toBeTruthy();
    expect(rowIds()).toEqual(['equity-beta', 'rates', 'credit', 'residual']);
  });

  // --- roving tabindex ------------------------------------------------------

  it('when the table renders, its body is one tab stop', () => {
    const tabbable = rowButtons().filter((b) => b.getAttribute('tabindex') === '0');
    expect(tabbable).toHaveLength(1);
    expect(tabbable[0].getAttribute('data-row')).toBe('AAPL');
  });

  it('when the down arrow is pressed on a row, focus moves to the next one', () => {
    const first = rowButtons()[0];
    first.focus();
    first.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowDown', bubbles: true }));
    fixture.detectChanges();

    expect(document.activeElement).toBe(rowButtons()[1]);
    expect(rowButtons()[1].getAttribute('tabindex')).toBe('0');
    expect(rowButtons()[0].getAttribute('tabindex')).toBe('-1');
  });

  it('when End is pressed on a row, focus moves to the last row of the page', () => {
    const first = rowButtons()[0];
    first.focus();
    first.dispatchEvent(new KeyboardEvent('keydown', { key: 'End', bubbles: true }));
    fixture.detectChanges();

    expect(document.activeElement).toBe(rowButtons()[24]);
  });

  it('when a row is activated, it reports the detail panel it controls', () => {
    const button = rowButtons()[0];
    expect(button.getAttribute('aria-expanded')).toBe('false');
    expect(button.getAttribute('aria-controls')).toBe('risk-attribution-detail');

    button.click();
    fixture.detectChanges();

    expect(rowButtons()[0].getAttribute('aria-expanded')).toBe('true');
    expect(service.selectedComponentId()).toBe('AAPL');
  });

  // --- the other states -----------------------------------------------------

  it('while a recompute runs, placeholder rows stand in for the table', async () => {
    const pending = service.recompute(false, 'method');
    fixture.detectChanges();

    const skeleton = host.querySelector('[data-testid="table-skeleton"]');
    expect(skeleton?.getAttribute('aria-busy')).toBe('true');
    expect(host.querySelector('table')).toBeNull();

    await pending;
  });

  it('when the search matches nothing, the table says so without claiming the book is empty', () => {
    service.search.set('ZZZZ');
    fixture.detectChanges();

    expect(host.querySelector('table')).toBeNull();
    const message = host.querySelector('[role="status"]');
    expect(message?.textContent).toContain('No component matches');
    expect(message?.textContent).toContain('26 components');
  });
});
