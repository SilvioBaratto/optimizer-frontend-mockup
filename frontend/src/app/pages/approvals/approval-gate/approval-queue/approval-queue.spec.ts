/**
 * The queue as a grid: the roles the doc names, arrow navigation between the
 * cards, Enter to open one, and the ordinary Tab order left intact beside both.
 */

import { ComponentFixture, TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';

import { ApprovalGateService } from '../../../../services/approval-gate.service';
import { ApprovalQueue } from './approval-queue';

describe('ApprovalQueue', () => {
  let fixture: ComponentFixture<ApprovalQueue>;
  let host: HTMLElement;
  let service: ApprovalGateService;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [ApprovalQueue],
      providers: [provideRouter([])],
    }).compileComponents();

    fixture = TestBed.createComponent(ApprovalQueue);
    host = fixture.nativeElement;
    service = TestBed.inject(ApprovalGateService);
    document.body.appendChild(host);
    fixture.detectChanges();
  });

  afterEach(() => {
    host.remove();
  });

  function grid(): HTMLElement {
    return host.querySelector('[data-testid="approval-queue-grid"]')!;
  }

  function cards(): HTMLButtonElement[] {
    return Array.from(host.querySelectorAll('[role="gridcell"] button'));
  }

  function press(key: string): void {
    grid().dispatchEvent(new KeyboardEvent('keydown', { key, bubbles: true }));
    fixture.detectChanges();
  }

  // --- structure ------------------------------------------------------------

  it('when the queue renders, it is a grid of rows of cells', () => {
    expect(grid().getAttribute('role')).toBe('grid');
    expect(grid().getAttribute('aria-label')).toContain('longest waiting first');

    const rows = Array.from(grid().querySelectorAll('[role="row"]'));
    expect(rows).toHaveLength(3);
    expect(rows.every((row) => row.querySelector('[role="gridcell"]') !== null)).toBe(true);
  });

  it('when the queue renders, every card carries its step and its wait in words', () => {
    const first = cards()[0];

    expect(first.textContent).toContain('TRD-2019 · QQQ · SELL');
    expect(first.textContent).toContain('5,000 sh');
    expect(first.textContent).toContain('$1.90M');
    expect(first.textContent).toContain('HUMAN GATE');
    expect(first.textContent).toContain('02:15:33');
  });

  it('when the queue renders, every card is an ordinary tab stop as well', () => {
    // Arrow navigation is offered *alongside* Tab, never instead of it, so no
    // card is taken out of the tab order by a roving tabindex.
    expect(cards().every((card) => card.tabIndex === 0)).toBe(true);
  });

  // --- keyboard -------------------------------------------------------------

  it('when ArrowDown is pressed, focus moves to the next card', () => {
    cards()[0].focus();

    press('ArrowDown');

    expect(document.activeElement).toBe(cards()[1]);
  });

  it('when ArrowUp is pressed, focus moves back to the previous card', () => {
    cards()[2].focus();

    press('ArrowUp');

    expect(document.activeElement).toBe(cards()[1]);
  });

  it('when ArrowDown is pressed on the last card, focus stays where it is', () => {
    const last = cards()[cards().length - 1];
    last.focus();

    press('ArrowDown');

    expect(document.activeElement).toBe(last);
  });

  it('when Enter is pressed on a card, that trade is opened', () => {
    cards()[1].focus();

    press('Enter');

    expect(service.selectedTradeId()).toBe('TRD-2031');
    expect(cards()[1].getAttribute('aria-current')).toBe('true');
  });

  it('when a key arrives with focus outside the grid, the grid does nothing', () => {
    service.select('TRD-2030');
    fixture.detectChanges();
    document.body.focus();

    press('ArrowDown');

    expect(service.selectedTradeId()).toBe('TRD-2030');
  });

  // --- selection ------------------------------------------------------------

  it('when a card is clicked, it becomes the current one', () => {
    cards()[2].click();
    fixture.detectChanges();

    expect(service.selectedTradeId()).toBe('TRD-2030');
    expect(cards()[2].getAttribute('aria-current')).toBe('true');
    expect(cards()[0].getAttribute('aria-current')).toBeNull();
  });

  it('when a trade is not at the human gate, its card is still selectable', () => {
    service.stepFilter.set('pre-trade');
    fixture.detectChanges();

    const card = cards()[0];
    expect(card.tagName).toBe('BUTTON');
    card.click();
    fixture.detectChanges();

    expect(service.selectedTradeId()).not.toBeNull();
  });

  it('when a card carries a step, a status and a wait, they hang off one projected element that stacks below sm', () => {
    service.stepFilter.set('all');
    service.statusFilter.set('all');
    fixture.detectChanges();

    const decided = cards().find((card) => card.textContent?.includes('TRD-2028'))!;
    const badges = Array.from(decided.querySelectorAll('app-status-badge'));
    expect(badges).toHaveLength(2);

    // `app-entity-card` drops what it is given into a `shrink-0` flex item,
    // sized at max-content. Laid out as a row, the two badges plus the wait
    // measured 265px against 261px of usable card at 320px and the document
    // scrolled sideways by 5px; a column's max-content is its widest child.
    const cluster = badges[0].parentElement!;
    expect(cluster).toBe(badges[1].parentElement);
    expect(cluster.querySelector('.tabular-nums')?.textContent).toContain(':');
    expect(cluster.className).toContain('flex-col');
    expect(cluster.className).toContain('sm:flex-row');
  });

  it('when a decided trade is shown, its status is named beside its step', () => {
    service.statusFilter.set('approved');
    fixture.detectChanges();

    const badges = Array.from(cards()[0].querySelectorAll('app-status-badge')).map(
      (badge) => badge.textContent?.trim() ?? '',
    );
    expect(badges.some((badge) => badge.includes('HUMAN GATE'))).toBe(true);
    expect(badges.some((badge) => badge.includes('Approved'))).toBe(true);
  });

  // --- the remainder --------------------------------------------------------

  it('when filters hide part of the queue, the remainder is counted and reachable', () => {
    const hidden = host.querySelector('[data-testid="queue-hidden-count"]')!;
    expect(hidden.textContent).toContain('11 more trades in queue');

    (hidden.querySelector('button') as HTMLButtonElement).click();
    fixture.detectChanges();

    expect(cards()).toHaveLength(14);
    expect(host.querySelector('[data-testid="queue-hidden-count"]')).toBeNull();
  });
});
