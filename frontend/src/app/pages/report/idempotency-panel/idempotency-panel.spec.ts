/**
 * The Orders & Idempotency tab.
 *
 * Empty by posture, and the tests say exactly that: not an error, not a
 * too-narrow filter, and not a page that failed to load. With no adapter
 * registered there is no POST, so there is no key, no deduplication result and
 * no order state to poll — and the sentence explaining it is read from the
 * broker posture rather than written into the template, which is why
 * registering an adapter fills the tab without anyone editing it.
 */

import { ComponentFixture, TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';

import { ExecutionService } from '../../../services/execution.service';
import { ReportAuditService } from '../../../services/report-audit.service';
import { IdempotencyPanel } from './idempotency-panel';

describe('IdempotencyPanel', () => {
  let fixture: ComponentFixture<IdempotencyPanel>;
  let host: HTMLElement;
  let service: ReportAuditService;
  let execution: ExecutionService;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [IdempotencyPanel],
      providers: [provideRouter([])],
    }).compileComponents();
    fixture = TestBed.createComponent(IdempotencyPanel);
    host = fixture.nativeElement;
    service = TestBed.inject(ReportAuditService);
    execution = TestBed.inject(ExecutionService);
    fixture.detectChanges();
  });

  function connect(): void {
    execution.setBroker({ posture: 'connected', adapter: 'Trading 212', detail: null });
    fixture.detectChanges();
  }

  it('when no broker is configured, the tab is empty and says which posture made it so', () => {
    const empty = host.querySelector('[data-testid="idempotency-empty"]');

    expect(empty?.textContent).toContain('No idempotency records');
    expect(empty?.textContent).toContain('No broker configured');
    expect(empty?.textContent).toContain('the default posture');
    expect(host.querySelector('table')).toBeNull();
  });

  it('when the tab is empty, it is announced as information and not as a failure', () => {
    expect(host.querySelector('[role="alert"]')).toBeNull();
    expect(host.querySelector('[data-testid="idempotency-empty"] [role="status"], [role="status"]'))
      .not.toBeNull();
  });

  it('when the tab is empty, it still documents what it would record', () => {
    expect(host.textContent).toContain('idempotency key generated client-side');
    expect(host.textContent).toContain('deduplication check made before the POST');
    expect(host.textContent).toContain('polling state used to reconcile');
  });

  it('when the tab is empty, the way out leads to the page that owns the posture', () => {
    const link = host.querySelector('app-cross-page-link a');

    expect(link?.getAttribute('href')).toBe('/fund/execution-agent');
  });

  it('when an adapter is registered, the records appear with key, dedup and reconciliation', () => {
    connect();

    expect(host.querySelector('[data-testid="idempotency-empty"]')).toBeNull();
    const headers = Array.from(host.querySelectorAll('thead th')).map((th) =>
      th.textContent?.trim(),
    );
    expect(headers).toEqual([
      'Trade',
      'Idempotency key',
      'Deduplication',
      'Posted',
      'Reconciliation',
    ]);
    expect(host.querySelectorAll('tbody tr')).toHaveLength(service.idempotencyRecords().length);
  });

  it('when a poll has not returned, the row says pending rather than an outcome', () => {
    connect();

    expect(host.textContent).toContain('Pending reconciliation');
    expect(host.textContent).toContain('neither confirmed nor lost');
  });

  it('when a replayed intent hits the same key, the duplicate is shown as suppressed and unsent', () => {
    connect();

    expect(host.textContent).toContain('Duplicate — suppressed');
    // Nothing left the core, so there is no send time — a dash with a word.
    expect(host.textContent).toContain('not sent — the duplicate was suppressed first');
  });

  it('when the log is being read, the tab shows placeholders and no verdict either way', async () => {
    const pending = service.refresh();
    fixture.detectChanges();

    expect(host.querySelector('[data-testid="idempotency-skeleton"]')).not.toBeNull();
    expect(host.querySelector('[data-testid="idempotency-empty"]')).toBeNull();

    await pending;
  });
});
