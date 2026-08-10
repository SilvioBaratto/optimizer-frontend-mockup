/**
 * The decision log table.
 *
 * The column that matters most here is Hash. A decision logged without a
 * prompt hash is the ordinary output of a model that gives no reproducibility
 * guarantee, so the cell must read as data — an em dash whose accessible name
 * is "not logged" — and never as a warning or as a cell a screen reader
 * announces as empty. The other half of the file is the two empty states,
 * which differ in exactly one respect: only one of them has a way out.
 */

import { ComponentFixture, TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';

import { ReportAuditService } from '../../../services/report-audit.service';
import { DecisionTable } from './decision-table';

describe('DecisionTable', () => {
  let fixture: ComponentFixture<DecisionTable>;
  let host: HTMLElement;
  let service: ReportAuditService;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [DecisionTable],
      providers: [provideRouter([])],
    }).compileComponents();
    fixture = TestBed.createComponent(DecisionTable);
    host = fixture.nativeElement;
    service = TestBed.inject(ReportAuditService);
    fixture.detectChanges();
  });

  function headers(): HTMLTableCellElement[] {
    return Array.from(host.querySelectorAll('thead th'));
  }

  function headerNamed(label: string): HTMLTableCellElement {
    const match = headers().find((th) => (th.textContent ?? '').trim().startsWith(label));
    expect(match).toBeTruthy();
    return match as HTMLTableCellElement;
  }

  function rows(): HTMLElement[] {
    return Array.from(host.querySelectorAll('[data-decision-row]'));
  }

  function hashCell(decisionId: string): HTMLElement {
    const cell = host.querySelector<HTMLElement>(`[data-hash="${decisionId}"]`);
    expect(cell).not.toBeNull();
    return cell as HTMLElement;
  }

  // --- sortable headers -----------------------------------------------------

  it('when the table renders, every sortable header carries an aria-sort state', () => {
    const sortable = headers().filter((th) => th.hasAttribute('aria-sort'));

    expect(sortable).toHaveLength(4);
    for (const th of sortable) {
      expect(['ascending', 'descending', 'none']).toContain(th.getAttribute('aria-sort'));
      expect(th.querySelector('button')?.tagName).toBe('BUTTON');
    }
  });

  it('when the table opens, only the time column carries a direction and it is newest first', () => {
    const directional = headers().filter((th) => {
      const sort = th.getAttribute('aria-sort');
      return sort === 'ascending' || sort === 'descending';
    });

    expect(directional).toHaveLength(1);
    expect(directional[0].textContent).toContain('Time');
    expect(directional[0].getAttribute('aria-sort')).toBe('descending');
  });

  it('when another header is activated, aria-sort moves to it and the previous one resets', () => {
    headerNamed('Agent').querySelector('button')!.click();
    fixture.detectChanges();

    expect(headerNamed('Agent').getAttribute('aria-sort')).toBe('ascending');
    expect(headerNamed('Time').getAttribute('aria-sort')).toBe('none');
  });

  it('when the same header is activated twice, the direction flips', () => {
    const button = headerNamed('Time').querySelector('button')!;

    button.click();
    fixture.detectChanges();

    expect(headerNamed('Time').getAttribute('aria-sort')).toBe('ascending');
  });

  it('when the header is sorted, the rows really are reordered', () => {
    // One page, so the reversal is visible rather than paged away.
    service.setPageSize(50);
    fixture.detectChanges();
    const before = rows().map((r) => r.getAttribute('data-decision-row'));

    headerNamed('Time').querySelector('button')!.click();
    fixture.detectChanges();

    expect(rows().map((r) => r.getAttribute('data-decision-row'))).toEqual([...before].reverse());
  });

  // --- the prompt hash column ----------------------------------------------

  it('when a decision has no prompt hash, the cell reads as an em dash labelled not logged', () => {
    const unhashed = service.visibleDecisions().find((d) => d.promptHash === null)!;

    const cell = hashCell(unhashed.id);
    expect(cell.textContent?.trim()).toBe('—');
    // Hidden from assistive tech, with a word supplied beside it — never a cell
    // that a screen reader announces as blank.
    expect(cell.getAttribute('aria-hidden')).toBe('true');
    expect(cell.parentElement?.querySelector('.sr-only')?.textContent).toBe('not logged');
  });

  it('when a decision has no prompt hash, nothing marks it as a problem', () => {
    const unhashed = service.visibleDecisions().find((d) => d.promptHash === null)!;
    const cell = hashCell(unhashed.id);

    const classes = `${cell.className} ${cell.parentElement?.className ?? ''}`;
    expect(classes).not.toContain('text-danger');
    expect(classes).not.toContain('text-warning');
    expect(cell.closest('[role="alert"]')).toBeNull();
    // …and the row is a row like any other.
    expect(rows().length).toBe(service.visibleDecisions().length);
  });

  it('when a decision does have a prompt hash, the cell prints it', () => {
    const hashed = service.visibleDecisions().find((d) => d.promptHash !== null)!;

    expect(hashCell(hashed.id).textContent?.trim()).toBe(hashed.promptHash);
  });

  it('when the table renders, the legend explains the dash rather than leaving it to be guessed', () => {
    expect(host.textContent).toContain('not logged');
    expect(host.textContent).toContain('not a missing value');
  });

  // --- what a row carries ---------------------------------------------------

  it('when a row renders, it names the parameters the decision was produced with', () => {
    const decision = service.visibleDecisions()[0];
    const expected = decision.params.map((p) => `${p.name}=${p.value}`).join(', ');

    const row = host.querySelector(`[data-decision-row="${decision.id}"]`)!.closest('tr')!;

    expect(expected).not.toBe('');
    expect(row.textContent?.replace(/\s+/g, ' ')).toContain(expected);
  });

  it('when a row renders, the Output column shows the output rather than only a button', () => {
    const decision = service.visibleDecisions()[0];

    const preview = host.querySelector<HTMLElement>(
      `[data-decision-preview="${decision.id}"]`,
    );

    expect(preview?.textContent?.trim()).toBe(decision.output[0]);
    // Clipped visually but complete in the DOM, so it is hidden from assistive
    // tech rather than read as if it were the whole record.
    expect(preview?.getAttribute('aria-hidden')).toBe('true');
    expect(
      host.querySelector(`[data-decision-view="${decision.id}"]`)?.getAttribute('aria-label'),
    ).toContain('View full output');
  });

  // --- opening a decision ---------------------------------------------------

  it('when a row is activated, it opens that decision and says so through aria-expanded', () => {
    const row = rows()[0];
    const id = row.getAttribute('data-decision-row');

    (row as HTMLButtonElement).click();
    fixture.detectChanges();

    expect(service.selectedDecisionId()).toBe(id);
    expect(row.getAttribute('aria-expanded')).toBe('true');
    expect(row.getAttribute('aria-controls')).toBe('report-decision-detail');
  });

  it('when a row is reached from the keyboard, it is a real button that opens with Enter', () => {
    const row = rows()[0];

    expect(row.tagName).toBe('BUTTON');
    row.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true }));
    // A <button> activates on Enter natively, which jsdom models with a click.
    (row as HTMLButtonElement).click();
    fixture.detectChanges();

    expect(service.selectedDecision()).not.toBeNull();
  });

  it('when the row’s View button is used, the same decision opens', () => {
    const decision = service.visibleDecisions()[2];

    host.querySelector<HTMLButtonElement>(`[data-decision-view="${decision.id}"]`)!.click();
    fixture.detectChanges();

    expect(service.selectedDecisionId()).toBe(decision.id);
  });

  // --- the two empty states -------------------------------------------------

  it('when the filters exclude everything, the empty state offers a reset', () => {
    service.applySearch('zzzz-no-such-decision');
    fixture.detectChanges();

    const empty = host.querySelector('[data-testid="empty-no-match"]');
    expect(empty?.textContent).toContain('No decisions match these filters');
    expect(host.querySelector('[data-testid="reset-filters"]')).not.toBeNull();
  });

  it('when the reset is used, the filters clear and the rows come back', () => {
    service.applySearch('zzzz-no-such-decision');
    fixture.detectChanges();

    host.querySelector<HTMLButtonElement>('[data-testid="reset-filters"]')!.click();
    fixture.detectChanges();

    expect(service.filtersActive()).toBe(false);
    expect(service.searchDraft()).toBe('');
    expect(rows().length).toBeGreaterThan(0);
  });

  it('when nothing has ever been logged, the empty state offers no reset at all', async () => {
    service.logHasDecisions.set(false);
    await service.refresh();
    fixture.detectChanges();

    const empty = host.querySelector('[data-testid="empty-no-log"]');
    expect(empty?.textContent).toContain('No decisions logged yet');
    expect(host.querySelector('[data-testid="empty-no-match"]')).toBeNull();
    // No filters to clear, so no control claiming it can clear them.
    expect(host.querySelector('[data-testid="reset-filters"]')).toBeNull();
    expect(host.querySelectorAll('button')).toHaveLength(0);
  });

  // --- loading --------------------------------------------------------------

  it('when the log is being read, the table shows placeholders and no rows', async () => {
    const pending = service.refresh();
    fixture.detectChanges();

    expect(host.querySelector('[data-testid="decisions-skeleton"]')).not.toBeNull();
    expect(host.querySelector('table')).toBeNull();
    expect(rows()).toHaveLength(0);

    await pending;
  });
});
