/**
 * The bridge to Views Builder — the page's primary action.
 *
 * The case this file exists for is the one the doc repeats: the direction shown
 * here is computed from the dominant state and there is no way to set it. So
 * the tests drive the *toolbar* — a different universe, a different model — and
 * assert that this card moved with it, and they check the service's own surface
 * for the absence of a setter, because a private one appearing later would make
 * every other assertion here worthless.
 */

import { ComponentFixture, TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';

import { MarketRegimesService } from '../../../../services/market-regimes.service';
import { RegimeViewBridge } from './regime-view-bridge';

describe('RegimeViewBridge', () => {
  let fixture: ComponentFixture<RegimeViewBridge>;
  let host: HTMLElement;
  let service: MarketRegimesService;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [RegimeViewBridge],
      providers: [provideRouter([])],
    }).compileComponents();

    fixture = TestBed.createComponent(RegimeViewBridge);
    host = fixture.nativeElement;
    service = TestBed.inject(MarketRegimesService);
    document.body.appendChild(host);
    fixture.detectChanges();
  });

  afterEach(() => host.remove());

  function text(testId: string): string {
    return host.querySelector(`[data-testid="${testId}"]`)?.textContent?.replace(/\s+/g, ' ').trim() ?? '';
  }

  function button(testId: string): HTMLButtonElement {
    return host.querySelector(`[data-testid="${testId}"]`) as HTMLButtonElement;
  }

  function clauses(): string[] {
    return Array.from(host.querySelectorAll('[data-testid="mr-bridge-clauses"] li')).map(
      (item) => item.textContent?.trim() ?? '',
    );
  }

  async function settle(): Promise<void> {
    await service.settled();
    fixture.detectChanges();
  }

  // --- the direction is derived, never set ----------------------------------

  it('when the card renders, it names the state it was derived from', () => {
    expect(text('mr-bridge-derived-from')).toBe('Crash 58%');
    expect(text('mr-bridge-direction')).toBe('▼ Defensive');
    expect(clauses()).toEqual([
      'lower expected returns',
      'higher correlations',
      'widened covariance',
    ]);
  });

  it('when the dominant state turns risk-on, the direction turns with it', async () => {
    service.setUniverse('equities-only');
    await settle();

    expect(service.dominantState()?.state).toBe('Bull');
    expect(text('mr-bridge-derived-from')).toBe('Bull 56%');
    expect(text('mr-bridge-direction')).toBe('▲ Risk-on');
    expect(clauses()).toEqual([
      'higher expected returns',
      'lower correlations',
      'tightened covariance',
    ]);
  });

  it('when the dominant state is neither, the direction is neutral rather than absent', async () => {
    service.setUniverse('global-multi-asset');
    await settle();

    expect(service.dominantState()?.state).toBe('Slow Growth');
    expect(text('mr-bridge-direction')).toBe('▬ Neutral');
    expect(clauses()[0]).toBe('expected returns at equilibrium');
  });

  it('when the regime model changes the state, the card follows the new state', async () => {
    service.setModel('hamilton');
    await settle();

    expect(service.dominantState()?.state).toBe('Recession');
    expect(text('mr-bridge-derived-from')).toBe('Recession 61%');
    expect(text('mr-bridge-direction')).toBe('▼ Defensive');
  });

  it('the service exposes no way to set the direction independently of the state', () => {
    const names = [
      ...Object.getOwnPropertyNames(MarketRegimesService.prototype),
      ...Object.keys(service as unknown as Record<string, unknown>),
    ];
    expect(names.filter((name) => /^set.*(view|direction)/i.test(name))).toEqual([]);
    expect((service as unknown as Record<string, unknown>)['setRegimeImpliedView']).toBeUndefined();
  });

  // --- the preview ----------------------------------------------------------

  it('when Preview is pressed, a read-only panel opens with the same draft', () => {
    button('mr-preview-view').click();
    fixture.detectChanges();

    const dialog = document.querySelector('[role="dialog"]');
    expect(dialog?.getAttribute('aria-modal')).toBe('true');
    expect(dialog?.getAttribute('aria-label')).toBe('Regime-implied view preview');
    expect(text('mr-preview-derived-from')).toBe('Crash 58%');
    expect(text('mr-preview-direction')).toBe('▼ Defensive');
  });

  it('when the preview is closed with Escape, focus returns to the button that opened it', () => {
    const opener = button('mr-preview-view');
    opener.focus();
    opener.click();
    fixture.detectChanges();

    document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
    fixture.detectChanges();

    expect(document.querySelector('[role="dialog"]')).toBeNull();
    expect(document.activeElement).toBe(opener);
  });

  // --- the primary action ---------------------------------------------------

  it('when Send is pressed, the view handed over is the one on the card', async () => {
    button('mr-send-view').click();
    fixture.detectChanges();

    // `aria-disabled`, never `disabled`: the button the reader just pressed has
    // to keep its place in the tab order while the hand-over is in flight.
    expect(button('mr-send-view').getAttribute('aria-busy')).toBe('true');
    expect(button('mr-send-view').hasAttribute('disabled')).toBe(false);
    expect(button('mr-send-view').textContent?.trim()).toBe('Sending…');

    await service.settled();
    await new Promise((resolve) => setTimeout(resolve, 800));
    fixture.detectChanges();

    expect(service.sentView()?.state).toBe('Crash');
    expect(service.sentView()?.direction).toBe('defensive');
    expect(text('mr-bridge-sent')).toContain('Defensive from Crash');
    expect(host.querySelector('[data-testid="mr-bridge-sent"]')?.getAttribute('role')).toBe('status');
  });

  it('while a hand-over is in flight, a second press is refused', async () => {
    const send = button('mr-send-view');
    send.click();
    send.click();
    send.click();
    fixture.detectChanges();

    await new Promise((resolve) => setTimeout(resolve, 800));
    fixture.detectChanges();

    expect(service.sentView()).not.toBeNull();
    expect(service.sendingView()).toBe(false);
  });

  it('when the hand-over fails, it is announced as an action failure with a retry', async () => {
    await service.sendView(true);
    fixture.detectChanges();

    const error = host.querySelector('[data-testid="mr-bridge-error"] [role="alert"]');
    expect(error).toBeTruthy();
    expect(error?.textContent).toContain('Nothing was written');
    expect(service.sentView()).toBeNull();

    // The hand-over failed; the estimate did not. Preview still opens a draft
    // that is perfectly valid, and neither button claims otherwise.
    expect(button('mr-preview-view').getAttribute('aria-disabled')).toBeNull();
    expect(button('mr-send-view').getAttribute('aria-describedby')).toBeNull();

    (host.querySelector('[data-testid="mr-bridge-error"] button') as HTMLButtonElement).click();
    await new Promise((resolve) => setTimeout(resolve, 800));
    fixture.detectChanges();

    expect(service.sentView()?.state).toBe('Crash');
    expect(host.querySelector('[data-testid="mr-bridge-error"]')).toBeNull();
  });

  // --- when there is nothing to send ----------------------------------------

  it('when there is no estimate, both actions refuse input and say why', async () => {
    service.setUniverse('em-equities');
    await settle();

    expect(text('mr-bridge-empty')).toContain('there is no view to draft');
    expect(button('mr-preview-view').getAttribute('aria-disabled')).toBe('true');
    expect(button('mr-send-view').getAttribute('aria-disabled')).toBe('true');
    expect(button('mr-send-view').getAttribute('aria-describedby')).toBe('mr-bridge-unavailable');
    expect(host.querySelector('#mr-bridge-unavailable')?.textContent).toContain(
      'no valid estimate to build a view from',
    );

    button('mr-preview-view').click();
    fixture.detectChanges();
    expect(document.querySelector('[role="dialog"]')).toBeNull();
  });

  // --- a caution, not a veto ------------------------------------------------

  it('when the filter is low-confidence, it is said in words and the action stays available', () => {
    expect(service.diagnostics().lowFilterConfidence).toBe(true);
    expect(text('mr-bridge-low-confidence')).toContain('possible missed turning point');
    expect(button('mr-send-view').getAttribute('aria-disabled')).toBeNull();
  });
});
