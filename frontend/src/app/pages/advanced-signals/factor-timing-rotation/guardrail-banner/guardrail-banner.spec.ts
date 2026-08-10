/**
 * The guardrail notice.
 *
 * The behaviour worth testing is the dismissal: it is scoped to the conflict
 * that was on screen, so it is not a way to switch the notice off for good. A
 * different conflicted factor brings it back, and so does a new session — which
 * here is a new service instance.
 */

import { ComponentFixture, TestBed } from '@angular/core/testing';

import { GUARDRAIL_BANNER_ID } from '../../../../models/factor-timing.model';
import { FactorTimingService } from '../../../../services/factor-timing.service';
import { GuardrailBanner } from './guardrail-banner';

describe('GuardrailBanner', () => {
  let fixture: ComponentFixture<GuardrailBanner>;
  let host: HTMLElement;
  let service: FactorTimingService;

  beforeEach(async () => {
    await TestBed.configureTestingModule({ imports: [GuardrailBanner] }).compileComponents();

    fixture = TestBed.createComponent(GuardrailBanner);
    host = fixture.nativeElement;
    service = TestBed.inject(FactorTimingService);
    fixture.detectChanges();
  });

  function text(testId: string): string {
    return host.querySelector(`[data-testid="${testId}"]`)?.textContent?.replace(/\s+/g, ' ').trim() ?? '';
  }

  function press(testId: string): void {
    (host.querySelector(`[data-testid="${testId}"]`) as HTMLElement).click();
    fixture.detectChanges();
  }

  // --- what it says ---------------------------------------------------------

  it('when the page renders, the notice states both guardrails politely', () => {
    const notice = host.querySelector('[data-testid="ft-guardrail-notice"]');

    expect(notice?.getAttribute('role')).toBe('status');
    expect(host.querySelector('[data-guardrail="near-arbitrage"]')?.textContent).toContain(
      'tilts moderated for breadth',
    );
    expect(host.querySelector('[data-guardrail="concentration"]')?.textContent).toContain(
      'performance chasing disabled by design',
    );
  });

  it('when the notice renders, it carries the anchor the Value Spread callout points at', () => {
    expect(host.querySelector(`#${GUARDRAIL_BANNER_ID}`)).toBeTruthy();
  });

  it('when detail is opened, the guardrails are explained rather than repeated', () => {
    expect(host.querySelector('[data-guardrail-detail="near-arbitrage"]')).toBeNull();

    press('ft-guardrail-detail-toggle');

    expect(
      host.querySelector('[data-testid="ft-guardrail-detail-toggle"]')?.getAttribute('aria-expanded'),
    ).toBe('true');
    expect(host.querySelector('[data-guardrail-detail="near-arbitrage"]')?.textContent).toContain(
      'squared Sharpe ratio is bounded above',
    );
    expect(text('ft-guardrail-conflict')).toContain('Momentum');
  });

  // --- dismissal ------------------------------------------------------------

  it('when dismissed, the notice goes and the anchor stays behind for the callout', () => {
    press('ft-guardrail-dismiss');

    expect(host.querySelector('[data-testid="ft-guardrail-notice"]')).toBeNull();
    expect(host.querySelector(`#${GUARDRAIL_BANNER_ID}`)).toBeTruthy();
  });

  it('when dismissed, the focus lands on the anchor rather than on the body', () => {
    const button = host.querySelector<HTMLElement>('[data-testid="ft-guardrail-dismiss"]');
    button?.focus();
    expect(document.activeElement).toBe(button);

    button?.click();
    fixture.detectChanges();

    // The button the reader pressed is gone; without this the focus would be on
    // <body>, eight regions away from where they were reading.
    expect(document.activeElement).toBe(host.querySelector(`#${GUARDRAIL_BANNER_ID}`));
  });

  it('when dismissed, the guardrails themselves are untouched', () => {
    const before = service.signalRows().map((row) => row.deltaPp);

    press('ft-guardrail-dismiss');

    expect(service.signalRows().map((row) => row.deltaPp)).toEqual(before);
    expect(service.guardrailNotices.length).toBe(2);
  });

  it('when a different factor starts conflicting, the dismissed notice comes back', async () => {
    press('ft-guardrail-dismiss');
    expect(host.querySelector('[data-testid="ft-guardrail-notice"]')).toBeNull();

    service.setFactorsInView(['value', 'size', 'quality']);
    await service.settled();
    fixture.detectChanges();

    expect(host.querySelector('[data-testid="ft-guardrail-notice"]')).toBeTruthy();
  });

  it('when a new session starts, the notice is back whatever was dismissed before', () => {
    press('ft-guardrail-dismiss');
    expect(host.querySelector('[data-testid="ft-guardrail-notice"]')).toBeNull();

    // A fresh TestBed is a fresh root injector, which is what a new session is.
    TestBed.resetTestingModule();
    TestBed.configureTestingModule({ imports: [GuardrailBanner] });
    const next = TestBed.createComponent(GuardrailBanner);
    next.detectChanges();

    expect(
      (next.nativeElement as HTMLElement).querySelector('[data-testid="ft-guardrail-notice"]'),
    ).toBeTruthy();
  });
});
