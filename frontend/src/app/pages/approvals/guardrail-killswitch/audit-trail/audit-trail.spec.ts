/**
 * Regions 7 + 8 — the checkpointed trail.
 *
 * The trail is the artefact the whole approval flow exists to produce, so the
 * assertions here are about fidelity rather than layout: the drawer prints the
 * original `ValueError` / `PydanticCustomError` text verbatim, the chip counts
 * are computed from the search rather than from the chips (so a stage's count
 * never disappears because its own chip is off), and Export is refused on an
 * empty view instead of writing a header-only file.
 */

import { ComponentFixture, TestBed } from '@angular/core/testing';

import { NO_EVENTS_MESSAGE } from '../../../../models/guardrail.model';
import { GuardrailService } from '../../../../services/guardrail.service';
import { AuditTrail } from './audit-trail';

describe('AuditTrail', () => {
  let fixture: ComponentFixture<AuditTrail>;
  let host: HTMLElement;
  let service: GuardrailService;

  beforeEach(async () => {
    vi.useFakeTimers();
    await TestBed.configureTestingModule({ imports: [AuditTrail] }).compileComponents();
    fixture = TestBed.createComponent(AuditTrail);
    host = fixture.nativeElement;
    service = TestBed.inject(GuardrailService);
    document.body.appendChild(host);
    fixture.detectChanges();
  });

  afterEach(() => {
    host.remove();
    vi.useRealTimers();
  });

  async function settle(): Promise<void> {
    await vi.advanceTimersByTimeAsync(5_000);
    fixture.detectChanges();
  }

  function rows(): HTMLElement[] {
    return Array.from(host.querySelectorAll('[data-event]'));
  }

  function click(selector: string): void {
    (host.querySelector(selector) as HTMLButtonElement).click();
    fixture.detectChanges();
  }

  function search(value: string): void {
    const field = host.querySelector('input[type="search"]') as HTMLInputElement;
    field.value = value;
    field.dispatchEvent(new Event('input', { bubbles: true }));
    fixture.detectChanges();
  }

  function loadMore(): HTMLButtonElement {
    return host.querySelector('[data-testid="audit-load-more"]') as HTMLButtonElement;
  }

  function exportButton(): HTMLButtonElement {
    return host.querySelector('[data-testid="audit-export"]') as HTMLButtonElement;
  }

  function chip(stage: string): HTMLButtonElement {
    return host.querySelector(`[data-stage="${stage}"]`) as HTMLButtonElement;
  }

  /** Walks the pages until the row is on screen — the trail is paginated. */
  function reveal(id: string): HTMLElement {
    while (host.querySelector(`[data-event="${id}"]`) === null && !loadMore().disabled) {
      loadMore().click();
      fixture.detectChanges();
    }
    const row = host.querySelector(`[data-event="${id}"]`);
    expect(row).not.toBeNull();
    return row as HTMLElement;
  }

  // --- the grid -------------------------------------------------------------

  it('when the trail renders, one page of events is on screen', () => {
    expect(rows()).toHaveLength(6);
    expect(service.events().length).toBeGreaterThan(6);
  });

  it('when a row renders, it names the time, the trade, the stage, the outcome and the actor', () => {
    const row = reveal('gev-2093');
    expect(row.textContent).toContain('09:16');
    expect(row.textContent).toContain('TRD-2033');
    expect(row.textContent).toContain('Rule Validation');
    expect(row.textContent).toContain('concentration_limit');
    expect(host.querySelector('[data-outcome="gev-2093"]')?.textContent).toContain('FAIL');
  });

  it('when an event has no trade behind it, the row prints a dash rather than a blank', () => {
    click('[data-stage="rule-validation"]');
    click('[data-stage="human-gate"]');
    search('risk.admin');

    const row = host.querySelector('[data-event="gev-2060"]') as HTMLElement;
    expect(row.textContent).toContain('—');
  });

  // --- pagination -----------------------------------------------------------

  it('when Load more is pressed, the next page joins the ones already on screen', () => {
    loadMore().click();
    fixture.detectChanges();

    expect(rows()).toHaveLength(12);
  });

  it('when every event has been loaded, Load more is disabled rather than removed', () => {
    while (!loadMore().disabled) {
      loadMore().click();
      fixture.detectChanges();
    }

    expect(rows()).toHaveLength(service.events().length);
    expect(loadMore().disabled).toBe(true);
    expect(loadMore()).not.toBeNull();
  });

  // --- the filters ----------------------------------------------------------

  it('when the chips render, each carries the live count for its stage', () => {
    for (const [stage, count] of Object.entries(service.eventCountByStage())) {
      expect(chip(stage).textContent).toContain(`(${count})`);
    }
  });

  it('when a stage chip is switched off, its rows go and its count stays', () => {
    const before = service.eventCountByStage()['pre-trade'];

    click('[data-stage="pre-trade"]');

    expect(chip('pre-trade').getAttribute('aria-pressed')).toBe('false');
    expect(chip('pre-trade').textContent).toContain(`(${before})`);
    expect(rows().every((r) => !(r.textContent ?? '').includes('Pre-check'))).toBe(true);
  });

  it('when the search names a trade, only that trade’s checkpoints remain', () => {
    search('TRD-2033');

    expect(rows()).toHaveLength(2);
    expect(rows().every((r) => (r.textContent ?? '').includes('TRD-2033'))).toBe(true);
  });

  it('when the search names a validator, the rows it raised remain', () => {
    search('concentration_limit');

    expect(rows()).toHaveLength(1);
    expect(rows()[0].getAttribute('data-event')).toBe('gev-2093');
  });

  it('when the filters match nothing, the empty state prints the spec’s own copy', () => {
    search('TRD-0000');

    expect(rows()).toHaveLength(0);
    expect(host.querySelector('app-empty-state')?.textContent).toContain(NO_EVENTS_MESSAGE);
    expect(host.querySelector('[data-testid="audit-clear-filters"]')).not.toBeNull();
  });

  it('when the filters are cleared from the empty state, the whole trail comes back', () => {
    search('TRD-0000');

    click('[data-testid="audit-clear-filters"]');

    expect(rows()).toHaveLength(6);
    expect((host.querySelector('input[type="search"]') as HTMLInputElement).value).toBe('');
  });

  // --- export ---------------------------------------------------------------

  it('when the view has rows, Export is offered and reports what left the page', () => {
    expect(exportButton().disabled).toBe(false);

    exportButton().click();
    fixture.detectChanges();

    expect(host.querySelector('[data-testid="audit-export-notice"]')?.textContent).toContain(
      `Exported ${service.visibleEventCount()} events`,
    );
  });

  it('when the filtered view is empty, Export is disabled', () => {
    search('TRD-0000');

    expect(exportButton().disabled).toBe(true);
  });

  // --- the detail drawer ----------------------------------------------------

  it('when a row’s detail is opened, the original validator error is printed verbatim', () => {
    reveal('gev-2093');
    click('[data-detail="gev-2093"]');

    const event = service.events().find((e) => e.id === 'gev-2093');
    expect(host.querySelector('[data-testid="audit-detail-message"]')?.textContent).toBe(
      event?.detail,
    );
    expect(host.querySelector('[data-testid="audit-detail-error-type"]')?.textContent).toContain(
      'PydanticCustomError',
    );
  });

  it('when a passing checkpoint has no exception behind it, the drawer says so', () => {
    click('[data-detail="gev-2101"]');

    expect(host.querySelector('[data-testid="audit-detail-message"]')?.textContent).toContain(
      'Nothing was raised at this checkpoint',
    );
    expect(host.querySelector('[data-testid="audit-detail-error-type"]')).toBeNull();
  });

  it('when the detail control renders, it names what it opens', () => {
    reveal('gev-2093');

    expect(host.querySelector('[data-detail="gev-2093"]')?.getAttribute('aria-label')).toBe(
      'View validation error for TRD-2033',
    );
  });

  it('when the drawer is closed, focus returns to the row that opened it', () => {
    reveal('gev-2093');
    const opener = host.querySelector('[data-detail="gev-2093"]') as HTMLButtonElement;
    opener.focus();
    opener.click();
    fixture.detectChanges();

    click('[data-testid="audit-detail-close"]');

    expect(host.querySelector('[data-testid="audit-detail-message"]')).toBeNull();
    expect(document.activeElement).toBe(host.querySelector('[data-detail="gev-2093"]'));
  });

  // --- states ---------------------------------------------------------------

  it('while the trail is being read, placeholders stand in for the rows', async () => {
    const pending = service.refresh();
    fixture.detectChanges();

    expect(rows()).toHaveLength(0);
    expect(host.querySelector('[data-testid="audit-loading"]')?.getAttribute('aria-busy')).toBe(
      'true',
    );

    await settle();
    await pending;
  });

  it('when the trail cannot be read, the failure is localised and retry restores it', async () => {
    const pending = service.refresh(['audit']);
    await settle();
    await pending;
    fixture.detectChanges();

    expect(host.querySelector('[data-testid="audit-error"]')?.textContent).toContain(
      'Could not read the guardrail audit trail.',
    );

    const retry = Array.from(host.querySelectorAll('button')).find(
      (b) => b.textContent?.trim() === 'Retry',
    ) as HTMLButtonElement;
    retry.click();
    await settle();

    expect(host.querySelector('[data-testid="audit-error"]')).toBeNull();
    expect(rows()).toHaveLength(6);
  });

  it('when the snapshot holds no events at all, the empty state still offers a way out', async () => {
    service.snapshotHasEvents.set(false);
    const pending = service.refresh();
    await settle();
    await pending;
    fixture.detectChanges();

    expect(rows()).toHaveLength(0);
    expect(host.querySelector('app-empty-state')?.textContent).toContain(NO_EVENTS_MESSAGE);
    expect(exportButton().disabled).toBe(true);
  });
});
