/**
 * The page as a whole: ten regions in wireframe order, four states, and the two
 * claims doc 16 exists to make — that approving means exactly what the posture
 * at the top of the page says it means, and that nothing is ever submitted on a
 * first click.
 */

import { ComponentFixture, TestBed } from '@angular/core/testing';
import { ActivatedRoute, provideRouter } from '@angular/router';

import {
  DECISION_EFFECT_SENTENCE,
  NO_TRADES_MESSAGE,
  QUEUE_ERROR_MESSAGE,
} from '../../../models/approval.model';
import { ApprovalGateService } from '../../../services/approval-gate.service';
import { ExecutionService } from '../../../services/execution.service';
import { ApprovalGate } from './approval-gate';

/**
 * jsdom implements `<dialog>` as an element with a reflected `open` attribute
 * and nothing else — `showModal()` and `close()` are absent, so the shared
 * `ConfirmDialog`'s effect throws the moment a spec opens one. The shim
 * supplies exactly those two browser primitives and nothing more; in
 * particular it focuses nothing, so what is asserted about focus below is this
 * page's own code.
 */
function installDialogPolyfill(): void {
  const proto = HTMLDialogElement.prototype;
  if (typeof proto.showModal !== 'function') {
    proto.showModal = function showModal(this: HTMLDialogElement): void {
      this.open = true;
    };
  }
  if (typeof proto.close !== 'function') {
    proto.close = function close(this: HTMLDialogElement): void {
      this.open = false;
    };
  }
}

/**
 * Waits out a service round trip started from a DOM event: the click handlers
 * behind Approve and Reject drop the promise they create, so a spec has to
 * wait on the same clock the service does.
 */
function settle(ms = 500): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

describe('ApprovalGate page', () => {
  let fixture: ComponentFixture<ApprovalGate>;
  let host: HTMLElement;
  let service: ApprovalGateService;
  let execution: ExecutionService;

  beforeAll(() => {
    installDialogPolyfill();
  });

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [ApprovalGate],
      providers: [provideRouter([])],
    }).compileComponents();

    fixture = TestBed.createComponent(ApprovalGate);
    host = fixture.nativeElement;
    service = TestBed.inject(ApprovalGateService);
    execution = TestBed.inject(ExecutionService);
    document.body.appendChild(host);
    fixture.detectChanges();
  });

  afterEach(() => {
    host.remove();
  });

  // --- helpers --------------------------------------------------------------

  function cards(): HTMLButtonElement[] {
    return Array.from(host.querySelectorAll('[role="gridcell"] button'));
  }

  function cardTitles(): string[] {
    return cards().map((card) => card.querySelector('.font-medium')?.textContent?.trim() ?? '');
  }

  function openCard(tradeId: string): HTMLButtonElement {
    const card = cards().find((c) => c.textContent?.includes(tradeId));
    expect(card).toBeTruthy();
    card!.click();
    fixture.detectChanges();
    return card!;
  }

  function byTestId(id: string): HTMLElement | null {
    return host.querySelector(`[data-testid="${id}"]`);
  }

  function setSearch(value: string): void {
    const field = host.querySelector('#approval-trade-search') as HTMLInputElement;
    field.value = value;
    field.dispatchEvent(new Event('input'));
    fixture.detectChanges();
  }

  function setStep(value: string): void {
    const select = host.querySelector('#approval-step-filter') as HTMLSelectElement;
    select.value = value;
    select.dispatchEvent(new Event('change'));
    fixture.detectChanges();
  }

  function dialogButton(label: string): HTMLButtonElement {
    const match = Array.from(host.querySelectorAll<HTMLButtonElement>('dialog button')).find(
      (button) => button.textContent?.trim() === label,
    );
    expect(match).toBeTruthy();
    return match!;
  }

  // --- regions --------------------------------------------------------------

  it('when the page renders, the regions appear in wireframe order', () => {
    openCard('TRD-2031');

    const markers = [
      '[data-testid="posture-banner"]',
      '#approval-filters',
      'app-collection-stat-bar',
      '[data-testid="approval-queue-grid"]',
      '#approval-trade-detail',
      '[data-testid="step-tracker"]',
      '[data-testid="precheck-result"]',
      '[data-testid="decision-sentence"]',
      '[data-testid="audit-trail-toggle"]',
    ].map((selector) => host.querySelector(selector));

    expect(markers.every((element) => element !== null)).toBe(true);

    const positions = markers.map((element) =>
      Array.prototype.indexOf.call(host.querySelectorAll('*'), element),
    );
    expect(positions).toEqual([...positions].sort((a, b) => a - b));
  });

  it('when the page renders, a skip link jumps past the shell onto the filters', () => {
    const skip = host.querySelector('a.skip-link');

    expect(skip?.getAttribute('href')).toBe('#approval-filters');
    expect(host.querySelector('#approval-filters')?.getAttribute('tabindex')).toBe('-1');
  });

  it('when a trade is open, headings start at h2 and skip no level on the way down', () => {
    openCard('TRD-2031');

    const levels = Array.from(host.querySelectorAll('h1,h2,h3,h4,h5,h6')).map((heading) =>
      Number(heading.tagName.slice(1)),
    );

    expect(levels.length).toBeGreaterThan(0);
    // The shell owns the <h1>; the page's own outline starts one level down.
    expect(Math.min(...levels)).toBe(2);
    expect(levels).not.toContain(1);
    const jumps = levels.filter((level, index) => index > 0 && level > levels[index - 1] + 1);
    expect(jumps).toEqual([]);
  });

  // --- the posture, and everything derived from it --------------------------

  it('when the page renders, the posture banner is announced and cannot be dismissed', () => {
    const banner = byTestId('posture-banner')!;

    expect(banner.getAttribute('role')).toBe('status');
    expect(banner.getAttribute('aria-live')).toBe('polite');
    expect(banner.textContent).toContain('NO BROKER CONFIGURED');
    // Nothing in the banner closes it, collapses it or retries it.
    expect(banner.querySelectorAll('button')).toHaveLength(0);
  });

  it('when a trade is at the gate, the decision sentence is the banner’s own sentence', () => {
    openCard('TRD-2031');

    const expected = DECISION_EFFECT_SENTENCE['not-configured'];
    expect(byTestId('posture-effect')?.textContent?.trim()).toBe(expected);
    expect(byTestId('decision-sentence')?.textContent?.trim()).toBe(expected);
  });

  it('when an adapter is registered, the banner and the decision sentence move together', () => {
    openCard('TRD-2031');

    execution.setBroker({ posture: 'connected', adapter: 'IBKR', detail: null });
    fixture.detectChanges();

    const expected = DECISION_EFFECT_SENTENCE.connected;
    expect(byTestId('posture-effect')?.textContent?.trim()).toBe(expected);
    expect(byTestId('decision-sentence')?.textContent?.trim()).toBe(expected);
    expect(byTestId('posture-banner')?.textContent).toContain('IBKR');
  });

  it('when no broker is configured, no card stands at the broker adapter step', () => {
    setStep('all');

    const badges = Array.from(host.querySelectorAll('[role="gridcell"] app-status-badge')).map(
      (badge) => badge.textContent ?? '',
    );

    expect(badges.length).toBeGreaterThan(0);
    expect(badges.some((badge) => badge.includes('BROKER'))).toBe(false);
  });

  // --- the queue ------------------------------------------------------------

  it('when the page opens, the queue is the human gate’s pending trades, longest wait first', () => {
    expect(cardTitles()).toEqual([
      'TRD-2019 · QQQ · SELL',
      'TRD-2031 · AAPL · BUY',
      'TRD-2030 · MSFT · SELL',
    ]);
    expect(byTestId('approval-queue-grid')?.getAttribute('role')).toBe('grid');
  });

  it('when the page opens, the collection bar states the count, the step and the order', () => {
    const bar = host.querySelector('app-collection-stat-bar');

    expect(bar?.getAttribute('role')).toBe('status');
    expect(bar?.textContent).toContain('3 of 14 trades in queue');
    expect(bar?.textContent).toContain('step Human Gate');
    expect(bar?.textContent).toContain('sorted by waiting time, longest first');
  });

  it('when a filter narrows the queue, the count and the hidden remainder follow', () => {
    setSearch('MSFT');

    expect(cardTitles()).toEqual(['TRD-2030 · MSFT · SELL']);
    expect(host.querySelector('app-collection-stat-bar')?.textContent).toContain(
      '1 of 14 trades in queue',
    );
    expect(byTestId('queue-hidden-count')?.textContent).toContain('13 more trades in queue');
  });

  // --- selection ------------------------------------------------------------

  it('when a card is selected, the panel opens on that trade and takes focus', async () => {
    openCard('TRD-2031');
    await fixture.whenStable();

    const heading = byTestId('detail-heading')!;
    expect(heading.textContent).toContain('TRD-2031 · AAPL · BUY · 12,400 sh / $2,460,000');
    expect(host.querySelector('#approval-trade-detail')?.textContent).toContain(
      'Proposed by Execution & Orders Agent',
    );
    expect(document.activeElement).toBe(heading);
  });

  it('when a card away from the gate is selected, the panel opens read-only', () => {
    setStep('rule-validation');
    openCard('TRD-2035');

    // The decision row itself — the posture sentence and the note — is absent.
    expect(byTestId('decision-sentence')).toBeNull();
    expect(host.querySelector('#approval-decision-note')).toBeNull();
    // The controls are not: they are announced as unavailable, with a reason.
    const approve = byTestId('approve-button')!;
    expect(approve.getAttribute('aria-disabled')).toBe('true');
    expect(host.querySelector(`#${approve.getAttribute('aria-describedby')}`)?.textContent).toContain(
      'not at the human gate',
    );
    // And the read-only regions are all still there.
    expect(byTestId('step-tracker')).not.toBeNull();
    expect(byTestId('precheck-result')).not.toBeNull();
    expect(byTestId('audit-trail-toggle')).not.toBeNull();
  });

  it('when a trade has never been decided, no recorded outcome is invented for it', () => {
    openCard('TRD-2031');

    expect(byTestId('outcome-status')).toBeNull();
    expect(byTestId('decision-sentence')).not.toBeNull();
  });

  // --- deciding -------------------------------------------------------------

  it('when Approve is confirmed, the trade leaves Pending and the panel records what it meant', async () => {
    openCard('TRD-2031');
    (byTestId('approve-button') as HTMLButtonElement).click();
    fixture.detectChanges();

    // The dialog restates the outcome in the current posture's own terms.
    expect(host.querySelector('dialog')?.textContent).toContain('Approved for manual placement');

    dialogButton('Approve trade').click();
    await settle();
    fixture.detectChanges();

    // The card has left the Pending filter…
    expect(cardTitles()).toEqual(['TRD-2019 · QQQ · SELL', 'TRD-2030 · MSFT · SELL']);
    // …and the decision row has been replaced by what the approval meant.
    expect(byTestId('decision-sentence')).toBeNull();
    expect(byTestId('outcome-status')?.textContent).toContain('APPROVED');
    expect(byTestId('outcome-effect')?.textContent).toContain('manual placement');
    expect(byTestId('outcome-meaning')?.textContent).toContain('does not leave the system');
  });

  it('when a decision is cancelled, nothing is submitted and the trade is still waiting', () => {
    openCard('TRD-2031');
    (byTestId('reject-button') as HTMLButtonElement).click();
    fixture.detectChanges();

    dialogButton('Cancel').click();
    fixture.detectChanges();

    expect(cardTitles()).toContain('TRD-2031 · AAPL · BUY');
    expect(byTestId('decision-sentence')).not.toBeNull();
    expect(byTestId('outcome-status')).toBeNull();
  });

  // --- states ---------------------------------------------------------------

  it('while the queue is being re-read, the cards become placeholders at their own height', async () => {
    const pending = service.refresh();
    fixture.detectChanges();

    const loading = byTestId('queue-loading')!;
    expect(loading.getAttribute('aria-busy')).toBe('true');
    expect(loading.querySelectorAll('app-skeleton-block')).toHaveLength(3);
    // The posture banner keeps its last known value rather than blanking out.
    expect(byTestId('posture-banner')?.textContent).toContain('NO BROKER CONFIGURED');

    await pending;
    fixture.detectChanges();
    expect(byTestId('queue-loading')).toBeNull();
  });

  it('when the queue cannot be read, the message says so and the filters still work', async () => {
    await service.refresh(true);
    fixture.detectChanges();

    const error = byTestId('queue-error')!;
    expect(error.textContent).toContain(QUEUE_ERROR_MESSAGE);
    expect(error.querySelector('[role="status"]')).not.toBeNull();
    expect(host.querySelector('[data-testid="approval-queue-grid"]')).toBeNull();

    // The way out of this state is another attempt, so the chips stay live.
    setSearch('AAPL');
    expect((host.querySelector('#approval-trade-search') as HTMLInputElement).value).toBe('AAPL');
  });

  it('when the filters match nothing, the empty state says so and offers the way out', () => {
    setSearch('ZZZZ');

    expect(host.textContent).toContain(NO_TRADES_MESSAGE);
    expect(host.textContent).toContain('Switch the step filter to All steps');

    const widen = Array.from(host.querySelectorAll('button')).find(
      (button) => button.textContent?.trim() === 'View full queue',
    )!;
    widen.click();
    fixture.detectChanges();

    expect(cards()).toHaveLength(14);
  });

  it('when the snapshot holds no trades at all, the queue says that instead', async () => {
    execution.snapshotHasOrders.set(false);
    await service.refresh();
    fixture.detectChanges();

    expect(host.textContent).toContain(NO_TRADES_MESSAGE);
    expect(host.textContent).toContain('has proposed no trades in this snapshot');
    // Nothing to widen to, so no control that pretends there is.
    expect(
      Array.from(host.querySelectorAll('button')).some((b) => b.textContent?.trim() === 'View full queue'),
    ).toBe(false);
  });

  it('when only the trade detail fails, the queue above stays usable', async () => {
    openCard('TRD-2031');

    await service.loadDetail(true);
    fixture.detectChanges();

    expect(byTestId('detail-error')).not.toBeNull();
    expect(byTestId('step-tracker')).toBeNull();
    // The queue and its filters are untouched.
    expect(cards()).toHaveLength(3);
    setSearch('AAPL');
    expect(cards()).toHaveLength(1);
  });

  // --- refresh --------------------------------------------------------------

  it('when the queue is refreshed, the filters and the selected trade survive', async () => {
    setSearch('MSFT');
    openCard('TRD-2030');

    await service.refresh();
    fixture.detectChanges();

    expect((host.querySelector('#approval-trade-search') as HTMLInputElement).value).toBe('MSFT');
    expect(cardTitles()).toEqual(['TRD-2030 · MSFT · SELL']);
    expect(byTestId('detail-heading')?.textContent).toContain('TRD-2030');
  });
});

describe('ApprovalGate page, entered with a trade in the URL', () => {
  it('when the page is opened on a trade id, that trade is preloaded without stealing focus', async () => {
    await TestBed.configureTestingModule({
      imports: [ApprovalGate],
      providers: [provideRouter([])],
    }).compileComponents();

    // A deep link from doc 15's order table. Patched before the first render,
    // which is the only moment the page reads it.
    const route = TestBed.inject(ActivatedRoute);
    (route.snapshot as unknown as { queryParams: Record<string, string> }).queryParams = {
      trade: 'TRD-2030',
    };

    const fixture = TestBed.createComponent(ApprovalGate);
    const host: HTMLElement = fixture.nativeElement;
    document.body.appendChild(host);
    fixture.detectChanges();
    await fixture.whenStable();

    expect(host.querySelector('[data-testid="detail-heading"]')?.textContent).toContain('TRD-2030');
    expect(document.activeElement).not.toBe(host.querySelector('[data-testid="detail-heading"]'));

    host.remove();
  });
});
