/**
 * The action row.
 *
 * The rules held here: the primary action is the only filled control and it
 * carries the Timing % column across; it is refused rather than `disabled`
 * while the page cannot supply a tilt, so focus never falls to `<body>`; and
 * the regime-sharing reference links out to the page that owns the estimate.
 */

import { ComponentFixture, TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';

import { FactorTimingService } from '../../../../services/factor-timing.service';
import { SignalActions } from './signal-actions';

describe('SignalActions', () => {
  let fixture: ComponentFixture<SignalActions>;
  let host: HTMLElement;
  let service: FactorTimingService;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [SignalActions],
      providers: [provideRouter([])],
    }).compileComponents();

    fixture = TestBed.createComponent(SignalActions);
    host = fixture.nativeElement;
    service = TestBed.inject(FactorTimingService);
    fixture.detectChanges();
  });

  function text(testId: string): string {
    return host.querySelector(`[data-testid="${testId}"]`)?.textContent?.replace(/\s+/g, ' ').trim() ?? '';
  }

  function button(testId: string): HTMLButtonElement {
    return host.querySelector(`[data-testid="${testId}"]`) as HTMLButtonElement;
  }

  // --- the cross-reference --------------------------------------------------

  it('when the row renders, the regime-sharing line links to the page that owns the estimate', () => {
    expect(text('ft-shared-regime-note')).toBe('Regime state shared with Macro & Regimes Agent');
    expect(host.querySelector('a[href="/advanced-signals/market-regimes"]')?.textContent).toContain(
      'Market Regimes',
    );
    expect(host.querySelector('a[href="/fund/macro-agent"]')).toBeTruthy();
  });

  // --- the primary action ---------------------------------------------------

  it('when the page is ready, the primary action is available and is the only filled control', () => {
    expect(button('ft-apply').getAttribute('aria-disabled')).toBeNull();
    expect(button('ft-apply').className).toContain('bg-primary');
    expect(button('ft-export').className).not.toContain('bg-primary');
  });

  it('when the tilts are applied, what was handed over is announced', async () => {
    button('ft-apply').click();
    fixture.detectChanges();

    expect(button('ft-apply').getAttribute('aria-busy')).toBe('true');
    // Never `disabled`: the pressed button keeps focus while the hand-off runs.
    expect(button('ft-apply').disabled).toBe(false);

    await service.settled();
    await new Promise((resolve) => setTimeout(resolve, 750));
    fixture.detectChanges();

    expect(text('ft-apply-success')).toContain('Tilts handed to Views Builder');
    expect(text('ft-apply-success')).toContain('Value +4');
    expect(host.querySelector('[data-testid="ft-apply-success"]')?.getAttribute('role')).toBe(
      'status',
    );
  });

  it('when the page has no tilt to send, the action is refused in words and by aria', async () => {
    service.setFactorsInView(['profitability']);
    await service.settled();
    fixture.detectChanges();

    expect(button('ft-apply').getAttribute('aria-disabled')).toBe('true');
    expect(button('ft-apply').getAttribute('aria-describedby')).toBe('ft-apply-blocked');
    expect(text('ft-apply-blocked')).toContain('enough history');

    button('ft-apply').click();
    fixture.detectChanges();

    expect(service.applied()).toBeNull();
  });

  it('when the computation failed, the action is refused with the reason named', async () => {
    await service.refresh(true);
    fixture.detectChanges();

    expect(button('ft-apply').getAttribute('aria-disabled')).toBe('true');
    expect(text('ft-apply-blocked')).toContain('without error');
  });

  it('when the hand-off fails, the failure is announced and nothing is cleared', async () => {
    await service.applyTilts(true);
    fixture.detectChanges();

    expect(host.querySelector('[data-testid="ft-apply-error"]')?.getAttribute('role')).toBe('alert');
    expect(text('ft-apply-error')).toContain('could not be handed to Views Builder');
    expect(text('ft-apply-error')).toContain('Nothing was written');
    // The button is still there to press again.
    expect(button('ft-apply').getAttribute('aria-disabled')).toBeNull();
  });

  // --- the export -----------------------------------------------------------

  it('when the snapshot is exported, what left the page is announced', () => {
    button('ft-export').click();
    fixture.detectChanges();

    expect(text('ft-export-notice')).toContain('Exported 6 factor rows');
    expect(text('ft-export-notice')).toContain('factor-timing-snapshot.csv');
    expect(host.querySelector('[data-testid="ft-export-notice"]')?.getAttribute('role')).toBe(
      'status',
    );
  });
});
