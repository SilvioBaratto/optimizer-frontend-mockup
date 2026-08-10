/**
 * The checkpointed trail: collapsed by default, a real disclosure, and inert
 * with respect to everything else on the page.
 */

import { ComponentFixture, TestBed } from '@angular/core/testing';

import { ApprovalGateService } from '../../../../services/approval-gate.service';
import { AuditTrail } from './audit-trail';

describe('AuditTrail', () => {
  let fixture: ComponentFixture<AuditTrail>;
  let host: HTMLElement;
  let service: ApprovalGateService;

  beforeEach(async () => {
    await TestBed.configureTestingModule({ imports: [AuditTrail] }).compileComponents();

    fixture = TestBed.createComponent(AuditTrail);
    host = fixture.nativeElement;
    service = TestBed.inject(ApprovalGateService);
    fixture.detectChanges();
  });

  function open(tradeId: string): void {
    service.select(tradeId);
    fixture.detectChanges();
  }

  function toggle(): HTMLButtonElement {
    return host.querySelector('[data-testid="audit-trail-toggle"]') as HTMLButtonElement;
  }

  function entries(): HTMLElement[] {
    return Array.from(host.querySelectorAll('[data-testid="audit-trail-list"] li'));
  }

  it('when a trade is selected, the trail is collapsed and counts what it holds', () => {
    open('TRD-2031');

    expect(toggle().getAttribute('aria-expanded')).toBe('false');
    expect(toggle().textContent).toContain('checkpoints');
    // Collapsed means absent from the accessibility tree, not merely invisible.
    expect(host.querySelector('[data-testid="audit-trail-list"]')).toBeNull();
  });

  it('when the disclosure is activated, the checkpoints appear in the region it names', () => {
    open('TRD-2031');
    const controls = toggle().getAttribute('aria-controls');

    toggle().click();
    fixture.detectChanges();

    expect(toggle().getAttribute('aria-expanded')).toBe('true');
    expect(host.querySelector(`#${controls} [data-testid="audit-trail-list"]`)).not.toBeNull();
    expect(entries().length).toBeGreaterThan(1);
  });

  it('when the trail is open, it starts where the trade entered the queue', () => {
    open('TRD-2031');
    toggle().click();
    fixture.detectChanges();

    expect(entries()[0].textContent).toContain('09:12:03');
    expect(entries()[0].textContent).toContain('Queued at Pre-check');
  });

  it('when a decided trade is read, its signature is one of the checkpoints', () => {
    open('TRD-2028');
    toggle().click();
    fixture.detectChanges();

    // The trail's own human-gate row, not a second one built from the order's
    // signature: the checkpoint is recorded once and shown once.
    const gate = entries().filter((entry) => entry.textContent?.includes('Human Approval'));
    expect(gate).toHaveLength(1);
    expect(gate[0].textContent).toContain('09:44');
    expect(gate[0].textContent).toContain('manual placement');
  });

  it('when the trail is toggled, the selected trade is left alone', () => {
    open('TRD-2031');

    toggle().click();
    fixture.detectChanges();
    toggle().click();
    fixture.detectChanges();

    expect(service.selectedTradeId()).toBe('TRD-2031');
    expect(toggle().getAttribute('aria-expanded')).toBe('false');
    expect(host.querySelector('[data-testid="audit-trail-list"]')).toBeNull();
  });
});
