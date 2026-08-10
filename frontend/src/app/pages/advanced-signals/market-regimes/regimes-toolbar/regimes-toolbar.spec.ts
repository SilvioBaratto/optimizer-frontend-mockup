/**
 * The toolbar — the coordinates every reading on the page is stated in.
 *
 * The cases below are about the two things this region is answerable for: that
 * each control actually re-fits the estimate rather than only redrawing, and
 * that an out-of-order sample window is refused *before* it can start a run, so
 * the page lands on an empty combination and not on a failed one.
 */

import { ComponentFixture, TestBed } from '@angular/core/testing';

import { SAMPLE_WINDOW_ORDER_ERROR } from '../../../../models/market-regimes.model';
import { MarketRegimesService } from '../../../../services/market-regimes.service';
import { RegimesToolbar } from './regimes-toolbar';

describe('RegimesToolbar', () => {
  let fixture: ComponentFixture<RegimesToolbar>;
  let host: HTMLElement;
  let service: MarketRegimesService;

  beforeEach(async () => {
    await TestBed.configureTestingModule({ imports: [RegimesToolbar] }).compileComponents();

    fixture = TestBed.createComponent(RegimesToolbar);
    host = fixture.nativeElement;
    service = TestBed.inject(MarketRegimesService);
    fixture.detectChanges();
  });

  function select(id: string): HTMLSelectElement {
    return host.querySelector(`#${id}`) as HTMLSelectElement;
  }

  function text(testId: string): string {
    return host.querySelector(`[data-testid="${testId}"]`)?.textContent?.trim() ?? '';
  }

  /** Picks a value on a native select and waits for any run it queues. */
  async function choose(id: string, value: string): Promise<void> {
    const control = select(id);
    control.value = value;
    control.dispatchEvent(new Event('change'));
    fixture.detectChanges();
    await service.settled();
    fixture.detectChanges();
  }

  function radio(label: string): HTMLButtonElement {
    const match = Array.from(host.querySelectorAll<HTMLButtonElement>('button[role="radio"]')).find(
      (button) => (button.textContent ?? '').trim() === label,
    );
    expect(match).toBeTruthy();
    return match as HTMLButtonElement;
  }

  // --- what the controls offer ----------------------------------------------

  it('when the toolbar renders, the regime model offers exactly the two models of this page', () => {
    const options = Array.from(select('mr-model').options).map((option) => option.textContent?.trim());
    expect(options).toEqual(['4-Regime Multi-Asset (VAR)', 'Macro Growth 2-state (Hamilton)']);
    expect(select('mr-model').value).toBe('four-state');
  });

  it('when the toolbar renders, every control is labelled and the stamp is read-only', () => {
    expect(host.querySelector('label[for="mr-model"]')?.textContent).toContain('Regime model');
    expect(host.querySelector('label[for="mr-universe"]')?.textContent).toContain('Universe');
    expect(host.querySelector('label[for="mr-sample-from"]')?.textContent).toContain('Sample from');
    expect(host.querySelector('label[for="mr-sample-to"]')?.textContent).toContain('Sample to');
    expect(text('mr-updated')).toContain('2026-07-31 08:12');
  });

  it('when the toolbar renders, the default window is the whole sample', () => {
    expect(select('mr-sample-from').value).toBe('1990-01');
    expect(select('mr-sample-to').value).toBe('2026-07');
    expect(text('mr-sample-note')).toContain('439 months in the estimation sample');
  });

  // --- each control re-fits the estimate ------------------------------------

  it('when the regime model changes, the estimate is re-fitted and the definition follows', async () => {
    await choose('mr-model', 'hamilton');

    expect(service.model()).toBe('hamilton');
    expect(service.modelStates()).toEqual(['Recession', 'Expansion']);
    expect(text('mr-model-definition')).toContain('two-state Markov switching model');
  });

  it('when the universe changes, the secondary line names the series it holds', async () => {
    await choose('mr-universe', 'global-multi-asset');

    expect(service.universeId()).toBe('global-multi-asset');
    expect(text('mr-universe-detail')).toBe(
      'Global multi-asset — Equities · LT Bonds · Commodities · FX',
    );
  });

  it('when a universe younger than the window is chosen, the note says where the sample really starts', async () => {
    await choose('mr-universe', 'em-equities');

    expect(text('mr-sample-note')).toContain("the universe's first observation is 2025-06");
  });

  it('when the probability basis is switched, the reading is re-derived on the smoother', async () => {
    radio('Smoothed').click();
    fixture.detectChanges();
    await service.settled();
    fixture.detectChanges();

    expect(service.probabilityBasis()).toBe('smoothed');
    expect(text('mr-basis-definition')).toContain('full-sample inference');
    // The smoother revises the path, not the last month of it: at t = T its
    // information set is the filter's, so today's reading is unchanged.
    expect(service.dominantState()?.probability).toBe(58);
  });

  // --- the one refusal ------------------------------------------------------

  it('when the window is put out of order, the error is announced and no run is started', async () => {
    await choose('mr-sample-to', '1989-12');

    expect(text('mr-sample-error')).toContain(SAMPLE_WINDOW_ORDER_ERROR);
    expect(host.querySelector('[data-testid="mr-sample-error"]')?.getAttribute('role')).toBe('alert');
    expect(select('mr-sample-from').getAttribute('aria-invalid')).toBe('true');
    expect(select('mr-sample-to').getAttribute('aria-describedby')).toBe('mr-sample-error');
    // Refused before it could queue a run: the page is empty, never loading.
    expect(service.state()).toBe('empty');
  });

  // --- the loading state ----------------------------------------------------

  it('while the filter re-runs, the controls stay in place and refuse input', async () => {
    const run = service.refresh();
    fixture.detectChanges();

    // `aria-disabled`, not `disabled`: a disabled control leaves the tab order,
    // and the refusal has to happen without doing that.
    expect(select('mr-model').getAttribute('aria-disabled')).toBe('true');
    expect(select('mr-model').disabled).toBe(false);
    expect(select('mr-universe').getAttribute('aria-disabled')).toBe('true');
    expect(select('mr-sample-from').getAttribute('aria-disabled')).toBe('true');
    expect(select('mr-sample-to').getAttribute('aria-disabled')).toBe('true');
    expect(radio('Filtered').getAttribute('aria-disabled')).toBe('true');
    expect(host.querySelector('[data-testid="mr-updated"]')).toBeTruthy();

    // Refused in the handler, and the visible value put back.
    const model = select('mr-model');
    model.value = 'hamilton';
    model.dispatchEvent(new Event('change'));
    fixture.detectChanges();
    expect(service.model()).toBe('four-state');
    expect(model.value).toBe('four-state');

    await run;
    fixture.detectChanges();
    expect(select('mr-model').getAttribute('aria-disabled')).toBeNull();
  });

  it('when a control queues a run, the reader keeps the focus they were holding', async () => {
    document.body.appendChild(host);
    const model = select('mr-model');
    model.focus();
    expect(document.activeElement).toBe(model);

    model.value = 'hamilton';
    model.dispatchEvent(new Event('change'));
    fixture.detectChanges();

    // The control the reader just used must not leave the document mid-run:
    // `[disabled]` here dropped focus to <body> and never gave it back.
    expect(document.activeElement).toBe(model);

    await service.settled();
    fixture.detectChanges();
    expect(document.activeElement).toBe(select('mr-model'));
    host.remove();
  });

  it('when a run completes, the updated stamp moves on', async () => {
    await service.refresh();
    fixture.detectChanges();

    expect(text('mr-updated')).toContain('2026-07-31 08:13');
  });
});
