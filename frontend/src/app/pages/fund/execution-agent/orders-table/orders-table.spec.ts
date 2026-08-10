/**
 * The proposed-orders table.
 *
 * This is where the sortable-header idiom is established for docs 19 and 24, so
 * the header contract is tested rather than assumed: `aria-sort` on the `<th>`,
 * a real `<button>` inside it, and exactly one column carrying a direction at a
 * time. The rest of the file guards the two rules that keep the table honest —
 * an unpriced order never shows a number, and a blocked order always shows the
 * rule that stopped it.
 */

import { ComponentFixture, TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';

import { ExecutionService } from '../../../../services/execution.service';
import { OrdersTable } from './orders-table';

describe('OrdersTable', () => {
  let fixture: ComponentFixture<OrdersTable>;
  let host: HTMLElement;
  let service: ExecutionService;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [OrdersTable],
      providers: [provideRouter([])],
    }).compileComponents();
    fixture = TestBed.createComponent(OrdersTable);
    host = fixture.nativeElement;
    service = TestBed.inject(ExecutionService);
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

  function showAllRows(): void {
    const expand = Array.from(host.querySelectorAll('button')).find(
      (b) => b.textContent?.trim() === 'View full table',
    );
    expand?.click();
    fixture.detectChanges();
  }

  function rowToggles(): HTMLButtonElement[] {
    return Array.from(host.querySelectorAll('[data-order-toggle]'));
  }

  // --- sortable headers -----------------------------------------------------

  it('when the table renders, every sortable header carries an aria-sort state', () => {
    const sortable = headers().filter((th) => th.hasAttribute('aria-sort'));
    expect(sortable).toHaveLength(6);
    for (const th of sortable) {
      expect(['ascending', 'descending', 'none']).toContain(th.getAttribute('aria-sort'));
    }
  });

  it('when the table renders, the sort control inside a header is a real button', () => {
    const control = headerNamed('Symbol').querySelector('button');
    expect(control).not.toBeNull();
    expect(control?.tagName).toBe('BUTTON');
  });

  it('when the table renders, only the sorted column carries a direction', () => {
    const directional = headers().filter((th) => {
      const sort = th.getAttribute('aria-sort');
      return sort === 'ascending' || sort === 'descending';
    });
    expect(directional).toHaveLength(1);
    expect(directional[0].textContent).toContain('Symbol');
  });

  it('when another header is activated, aria-sort moves to it and the previous one resets', () => {
    headerNamed('Target ΔQty').querySelector('button')!.click();
    fixture.detectChanges();

    expect(headerNamed('Target ΔQty').getAttribute('aria-sort')).toBe('ascending');
    expect(headerNamed('Symbol').getAttribute('aria-sort')).toBe('none');
  });

  it('when the same header is activated twice, aria-sort flips to descending', () => {
    const button = headerNamed('Est. E').querySelector('button')!;
    button.click();
    fixture.detectChanges();
    expect(headerNamed('Est. E').getAttribute('aria-sort')).toBe('ascending');

    headerNamed('Est. E').querySelector('button')!.click();
    fixture.detectChanges();
    expect(headerNamed('Est. E').getAttribute('aria-sort')).toBe('descending');
  });

  it('when a header is activated, the rows are actually reordered', () => {
    const before = rowToggles().map((b) => b.getAttribute('data-order-toggle'));

    headerNamed('Symbol').querySelector('button')!.click();
    fixture.detectChanges();
    const after = rowToggles().map((b) => b.getAttribute('data-order-toggle'));

    expect(after).not.toEqual(before);
  });

  it('the Schedule column is not sortable — a trajectory has no single value', () => {
    expect(headerNamed('Schedule').hasAttribute('aria-sort')).toBe(false);
  });

  // --- the two honesty rules ------------------------------------------------

  it('when an order has no estimates, both estimate cells show a dash, not a number', () => {
    showAllRows();
    const row = host.querySelector('[data-order-toggle="TRD-2036"]')!.closest('tr')!;
    const cells = Array.from(row.querySelectorAll('td')).map((td) => td.textContent ?? '');

    // Est. E and Est. √V are the fifth and sixth cells after the row header.
    expect(cells[3]).toContain('—');
    expect(cells[4]).toContain('—');
    expect(cells[3]).not.toMatch(/\d/);
    expect(cells[4]).not.toMatch(/\d/);
  });

  it('when an order has no estimates, the dash is explained as scheduling incomplete', () => {
    showAllRows();
    const row = host.querySelector('[data-order-toggle="TRD-2036"]')!.closest('tr')!;
    expect(row.textContent).toContain('Not available — scheduling incomplete');
  });

  it('when an order has no schedule, the sparkline cell says so instead of drawing bars', () => {
    showAllRows();
    const row = host.querySelector('[data-order-toggle="TRD-2036"]')!.closest('tr')!;
    expect(row.querySelector('[data-schedule-toggle]')).toBeNull();
    expect(row.textContent).toContain('Not scheduled — scheduling incomplete');
  });

  it('when an order is blocked by a rule, the rule is written out next to the glyph', () => {
    const reason = host.querySelector('[data-status-reason="TRD-2033"]');
    expect(reason).not.toBeNull();
    expect(reason?.textContent).toContain('concentration limit');
    expect(reason?.textContent).toContain('12.0% cap');
  });

  it('when an order is blocked, the stage cell pairs the glyph with the word', () => {
    const row = host.querySelector('[data-order-toggle="TRD-2033"]')!.closest('tr')!;
    const stageCell = row.querySelectorAll('td')[5];
    expect(stageCell.textContent).toContain('Blocked');
  });

  it('when an order is still moving, the stage cell spells the stage the filter offers', () => {
    showAllRows();
    const stageOf = (id: string) =>
      host
        .querySelector(`[data-order-toggle="${id}"]`)!
        .closest('tr')!
        .querySelectorAll('td')[5].textContent?.trim();

    // The Stage select above the table offers "Pre-trade check" and "Rule
    // validation"; an abbreviation in the cell would be a third spelling of a
    // value the reader has just picked from that list.
    expect(stageOf('TRD-2039')).toContain('Pre-trade check');
    expect(stageOf('TRD-2032')).toContain('Rule validation');
  });

  // --- the sparkline's textual equivalent -----------------------------------

  it('when an order is scheduled, its sparkline is reachable as a control naming the slices', () => {
    const control = host.querySelector('[data-schedule-toggle="TRD-2031"]') as HTMLButtonElement;
    expect(control).not.toBeNull();
    expect(control.tagName).toBe('BUTTON');

    const order = service.order('TRD-2031')!;
    expect(control.textContent).toContain(`over ${order.trajectory.length} intervals`);
    expect(control.textContent).toContain('Opens the trajectory chart');
  });

  it('when the sparkline control is activated, that order is selected', () => {
    (host.querySelector('[data-schedule-toggle="TRD-2031"]') as HTMLButtonElement).click();
    fixture.detectChanges();
    expect(service.selectedOrderId()).toBe('TRD-2031');
  });

  // --- the expand toggle ----------------------------------------------------

  it('when a row is collapsed, its toggle reports aria-expanded false and names the panel', () => {
    const toggle = rowToggles()[0];
    expect(toggle.getAttribute('aria-expanded')).toBe('false');
    expect(toggle.getAttribute('aria-controls')).toBe('execution-order-detail');
  });

  it('when a row toggle is activated, aria-expanded becomes true', () => {
    const toggle = rowToggles()[0];
    toggle.click();
    fixture.detectChanges();
    expect(rowToggles()[0].getAttribute('aria-expanded')).toBe('true');
  });

  it('when an expanded row toggle is activated again, the row collapses', () => {
    rowToggles()[0].click();
    fixture.detectChanges();
    rowToggles()[0].click();
    fixture.detectChanges();

    expect(rowToggles()[0].getAttribute('aria-expanded')).toBe('false');
    expect(service.selectedOrderId()).toBeNull();
  });

  // --- collapsing -----------------------------------------------------------

  it('when the table is collapsed, it says how many orders are not shown', () => {
    expect(rowToggles()).toHaveLength(4);
    expect(host.textContent).toContain('10 more orders');
  });

  it('when "View full table" is activated, every proposed order is listed', () => {
    showAllRows();
    expect(rowToggles()).toHaveLength(service.totalCount());
  });

  // --- the four states ------------------------------------------------------

  it('while the snapshot is being read, placeholder rows stand in for the table', async () => {
    const pending = service.refresh();
    fixture.detectChanges();

    const skeleton = host.querySelector('[data-testid="orders-skeleton"]');
    expect(skeleton).not.toBeNull();
    expect(skeleton?.getAttribute('aria-busy')).toBe('true');
    expect(host.querySelector('table')).toBeNull();

    await pending;
  });

  it('when the snapshot holds no orders, an empty state replaces the table', async () => {
    service.snapshotHasOrders.set(false);
    await service.refresh();
    fixture.detectChanges();

    expect(host.querySelector('table')).toBeNull();
    expect(host.textContent).toContain('No orders proposed');
    expect(host.querySelector('a')).not.toBeNull();
  });

  it('when the snapshot cannot be read, an error state with a retry replaces the table', async () => {
    await service.refresh(true);
    fixture.detectChanges();

    expect(host.querySelector('table')).toBeNull();
    const error = host.querySelector('[role="status"]');
    expect(error?.textContent).toContain('Could not read the fund-state snapshot');
    expect(
      Array.from(host.querySelectorAll('button')).some((b) => b.textContent?.includes('Retry')),
    ).toBe(true);
  });

  it('when filters match nothing, the table says so without claiming the agent found nothing', () => {
    service.symbolQuery.set('ZZZZ');
    fixture.detectChanges();

    expect(host.textContent).toContain('No proposed order matches the current filters');
    expect(host.textContent).toContain('14 orders');
  });
});
