/**
 * The page as a whole: the eight regions in wireframe order, and the two
 * page-level guarantees the doc singles out.
 *
 * The first is a tab-order claim, and it is checked literally rather than by
 * eye — the kill-switch toggle must be the first focusable element in the main
 * content, because the control with deterministic priority over every other
 * decision should not be reached through anything else. A toolbar, a skip link
 * or a stray link above the hero would break it, and this test would say so.
 *
 * The second is isolation: a failed read of one region must not blank the
 * others. It is asserted the hard way, by failing the limits read and then
 * looking for real audit rows, real pipeline counters and a live kill-switch on
 * the same screen.
 */

import { ComponentFixture, TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';

import { GuardrailService } from '../../../services/guardrail.service';
import { GuardrailKillswitch } from './guardrail-killswitch';

const FOCUSABLE =
  'a[href],button:not([disabled]),input:not([disabled]),select:not([disabled]),' +
  'textarea:not([disabled]),[tabindex]:not([tabindex="-1"])';

describe('GuardrailKillswitch page', () => {
  let fixture: ComponentFixture<GuardrailKillswitch>;
  let host: HTMLElement;
  let service: GuardrailService;

  beforeEach(async () => {
    vi.useFakeTimers();
    await TestBed.configureTestingModule({
      imports: [GuardrailKillswitch],
      providers: [provideRouter([])],
    }).compileComponents();
    fixture = TestBed.createComponent(GuardrailKillswitch);
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

  function focusable(): HTMLElement[] {
    return Array.from(host.querySelectorAll<HTMLElement>(FOCUSABLE));
  }

  function headings(): string[] {
    return Array.from(host.querySelectorAll('h2')).map((h) => (h.textContent ?? '').trim());
  }

  // --- the regions, in order ------------------------------------------------

  it('when the page renders, the eight regions appear in the wireframe’s order', () => {
    const regions = Array.from(
      host.querySelectorAll(
        'app-kill-switch-hero,app-approval-pipeline,app-hard-limits,' +
          'app-guardrail-concentration,app-audit-trail',
      ),
    ).map((el) => el.tagName.toLowerCase());

    expect(regions).toEqual([
      'app-kill-switch-hero',
      'app-approval-pipeline',
      'app-hard-limits',
      'app-guardrail-concentration',
      'app-audit-trail',
    ]);
  });

  it('when the page renders, its section labels read as the wireframe writes them', () => {
    expect(headings()).toContain('APPROVAL PIPELINE · TODAY');
    expect(headings()).toContain('HARD LIMITS & VALIDATORS');
    expect(headings()).toContain('GUARDRAIL AUDIT TRAIL');
  });

  it('when the page renders, it starts at h2 — the shell owns the h1', () => {
    expect(host.querySelector('h1')).toBeNull();
    expect(host.querySelector('h2')).not.toBeNull();
    expect(host.querySelector('h4')).toBeNull();
  });

  // --- the tab-order claim --------------------------------------------------

  it('when the page renders, the kill-switch toggle is the first thing in the tab order', () => {
    expect(focusable()[0]).toBe(host.querySelector('[data-testid="kill-switch-toggle"]'));
  });

  it('when the page renders, nothing focusable is placed above the hero card', () => {
    const hero = host.querySelector('app-kill-switch-hero') as HTMLElement;
    const outside = focusable().filter((el) => !hero.contains(el));

    expect(outside.length).toBeGreaterThan(0);
    for (const el of outside) {
      const follows =
        (hero.compareDocumentPosition(el) & Node.DOCUMENT_POSITION_FOLLOWING) !== 0;
      expect(follows).toBe(true);
    }
  });

  // --- per-region isolation -------------------------------------------------

  it('when the limits read fails, the audit trail and the pipeline are untouched', async () => {
    const pending = service.refresh(['limits']);
    await settle();
    await pending;
    fixture.detectChanges();

    expect(host.querySelector('[data-testid="limits-error"]')).not.toBeNull();
    expect(host.querySelectorAll('[data-event]').length).toBeGreaterThan(0);
    expect(host.querySelectorAll('[data-step]')).toHaveLength(4);
    expect(host.querySelector('[data-testid="kill-switch-status"]')?.textContent).toContain(
      'TRADING ENABLED',
    );
  });

  it('when the audit read fails, the limits grid stays on screen', async () => {
    const pending = service.refresh(['audit']);
    await settle();
    await pending;
    fixture.detectChanges();

    expect(host.querySelector('[data-testid="audit-error"]')).not.toBeNull();
    expect(host.querySelectorAll('[data-limit]')).toHaveLength(5);
  });

  it('when the kill-switch read fails, the rest of the page still works', async () => {
    const pending = service.refresh(['kill-switch']);
    await settle();
    await pending;
    fixture.detectChanges();

    expect((host.querySelector('[data-testid="kill-switch-toggle"]') as HTMLButtonElement).disabled).toBe(
      true,
    );
    expect(host.querySelectorAll('[data-limit]')).toHaveLength(5);
    expect(host.querySelectorAll('[data-event]').length).toBeGreaterThan(0);
    expect(host.querySelector('[data-testid="portfolio-di"]')).not.toBeNull();
  });

  it('when every region fails, each one says so in its own place', async () => {
    const pending = service.refresh(true);
    await settle();
    await pending;
    fixture.detectChanges();

    expect(host.querySelector('[data-testid="kill-switch-error"]')).not.toBeNull();
    expect(host.querySelector('[data-testid="limits-error"]')).not.toBeNull();
    expect(host.querySelector('[data-testid="concentration-error"]')).not.toBeNull();
    expect(host.querySelector('[data-testid="audit-error"]')).not.toBeNull();
  });

  // --- View log crosses regions --------------------------------------------

  it('when View log is pressed on a limit, the trail below is filtered and takes focus', () => {
    (host.querySelector('[data-log="lim-single-name"]') as HTMLButtonElement).click();
    fixture.detectChanges();

    expect(service.search()).toBe('concentration_limit');
    expect(host.querySelectorAll('[data-event]')).toHaveLength(1);
    expect(document.activeElement).toBe(host.querySelector('#guardrail-audit-trail'));
  });

  it('when View log is pressed with that validator’s stage switched off, its rows still appear', () => {
    // The concentration limit raises at rule-validation; switch that chip off first.
    (host.querySelector('[data-stage="rule-validation"]') as HTMLButtonElement).click();
    fixture.detectChanges();

    (host.querySelector('[data-log="lim-single-name"]') as HTMLButtonElement).click();
    fixture.detectChanges();

    expect(host.querySelector('app-audit-trail app-empty-state')).toBeNull();
    expect(host.querySelectorAll('[data-event]')).toHaveLength(1);
  });

  // --- exits ----------------------------------------------------------------

  it('when the page renders, each exit appears once, in the region the doc puts it in', () => {
    const hrefs = Array.from(host.querySelectorAll('a[href]')).map((a) => a.getAttribute('href'));

    expect(hrefs.filter((h) => h === '/approvals/approval-gate')).toHaveLength(1);
    expect(hrefs.filter((h) => h === '/risk/risk-attribution')).toHaveLength(1);
    expect(
      host.querySelector('app-approval-pipeline a[href="/approvals/approval-gate"]'),
    ).not.toBeNull();
    expect(
      host.querySelector('app-guardrail-concentration a[href="/risk/risk-attribution"]'),
    ).not.toBeNull();
  });

  // --- the empty state ------------------------------------------------------

  it('when nothing is configured or logged, both grids fall back to their empty states', async () => {
    service.snapshotHasLimits.set(false);
    service.snapshotHasEvents.set(false);
    const pending = service.refresh();
    await settle();
    await pending;
    fixture.detectChanges();

    expect(host.querySelectorAll('app-empty-state').length).toBe(2);
    expect(host.querySelectorAll('[data-limit]')).toHaveLength(0);
    expect(host.querySelectorAll('[data-event]')).toHaveLength(0);
    expect(host.querySelector('[data-testid="kill-switch-status"]')).not.toBeNull();
  });

  // --- loading --------------------------------------------------------------

  it('while the page reads, every region shows a placeholder rather than a spinner', async () => {
    const pending = service.refresh();
    fixture.detectChanges();

    expect(host.querySelector('[data-testid="kill-switch-loading"]')).not.toBeNull();
    expect(host.querySelector('[data-testid="limits-loading"]')).not.toBeNull();
    expect(host.querySelector('[data-testid="audit-loading"]')).not.toBeNull();
    expect(host.querySelectorAll('app-skeleton-block').length).toBeGreaterThan(8);

    await settle();
    await pending;
  });
});
