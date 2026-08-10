/**
 * The diagnostics footer.
 *
 * One thing is load-bearing: the low-confidence warning is text, and it is a
 * function of the reading above it rather than a flag anybody sets. So the
 * tests move the estimate to a reading that is *not* near a half and check the
 * warning goes away on its own.
 */

import { ComponentFixture, TestBed } from '@angular/core/testing';

import { MarketRegimesService } from '../../../../services/market-regimes.service';
import { RegimeDiagnostics } from './regime-diagnostics';

describe('RegimeDiagnostics', () => {
  let fixture: ComponentFixture<RegimeDiagnostics>;
  let host: HTMLElement;
  let service: MarketRegimesService;

  beforeEach(async () => {
    await TestBed.configureTestingModule({ imports: [RegimeDiagnostics] }).compileComponents();

    fixture = TestBed.createComponent(RegimeDiagnostics);
    host = fixture.nativeElement;
    service = TestBed.inject(MarketRegimesService);
    fixture.detectChanges();
  });

  function text(testId: string): string {
    return host.querySelector(`[data-testid="${testId}"]`)?.textContent?.replace(/\s+/g, ' ').trim() ?? '';
  }

  async function settle(): Promise<void> {
    await service.settled();
    fixture.detectChanges();
  }

  it('when the footer renders, it carries the fit rather than the market', () => {
    expect(text('mr-log-likelihood')).toBe('−1,284.6');
    expect(text('mr-last-calibration')).toBe('2026-06-30');
    expect(text('mr-top-probability')).toBe('58%');
  });

  it('when the top probability sits near a half, the warning is text and names the condition', () => {
    const warning = host.querySelector('[data-testid="mr-low-confidence"]');
    expect(warning?.getAttribute('role')).toBe('status');
    expect(warning?.textContent).toContain('possible missed turning point');
    expect(warning?.textContent).toContain('within 8 points of 50%');
  });

  it('when the filter is confident, the warning disappears on its own', async () => {
    service.setModel('hamilton');
    await settle();

    // 61% is more than eight points clear of a half, so nothing raises it.
    expect(text('mr-top-probability')).toBe('61%');
    expect(host.querySelector('[data-testid="mr-low-confidence"]')).toBeNull();
  });

  it('when the log-likelihood is re-maximised on another model, the footer follows it', async () => {
    service.setModel('hamilton');
    await settle();

    expect(text('mr-log-likelihood')).toBe('−1,497.2');
  });

  it('when nothing could be fitted, the fit figures read as absent rather than as zero', async () => {
    service.setUniverse('em-equities');
    await settle();

    expect(text('mr-log-likelihood')).toBe('—');
    expect(text('mr-top-probability')).toBe('—');
    expect(host.querySelector('[data-testid="mr-low-confidence"]')).toBeNull();
  });
});
