/**
 * The toolbar — the coordinates every reading on the page is stated in.
 *
 * Three things this region is answerable for: that every group really is a
 * radiogroup and not a row of toggle buttons, that the market-state lookback
 * writes the **shared** regime service rather than a copy of its own, and that
 * an interval shorter than the one the signals were estimated over is announced
 * as stale in words rather than by tinting the stamp.
 */

import { ComponentFixture, TestBed } from '@angular/core/testing';

import { NO_FACTOR_SELECTED_ERROR } from '../../../../models/factor-timing.model';
import { FactorTimingService } from '../../../../services/factor-timing.service';
import { MarketRegimesService } from '../../../../services/market-regimes.service';
import { FactorTimingToolbar } from './factor-timing-toolbar';

describe('FactorTimingToolbar', () => {
  let fixture: ComponentFixture<FactorTimingToolbar>;
  let host: HTMLElement;
  let service: FactorTimingService;
  let regimes: MarketRegimesService;

  beforeEach(async () => {
    await TestBed.configureTestingModule({ imports: [FactorTimingToolbar] }).compileComponents();

    fixture = TestBed.createComponent(FactorTimingToolbar);
    host = fixture.nativeElement;
    service = TestBed.inject(FactorTimingService);
    regimes = TestBed.inject(MarketRegimesService);
    fixture.detectChanges();
  });

  function text(testId: string): string {
    return host.querySelector(`[data-testid="${testId}"]`)?.textContent?.replace(/\s+/g, ' ').trim() ?? '';
  }

  function group(label: string): HTMLElement {
    const found = host.querySelector<HTMLElement>(`[role="radiogroup"][aria-label="${label}"]`);
    expect(found).toBeTruthy();
    return found as HTMLElement;
  }

  function radio(groupLabel: string, optionLabel: string): HTMLButtonElement {
    const match = Array.from(
      group(groupLabel).querySelectorAll<HTMLButtonElement>('button[role="radio"]'),
    ).find((button) => (button.textContent ?? '').trim() === optionLabel);
    expect(match).toBeTruthy();
    return match as HTMLButtonElement;
  }

  async function pick(groupLabel: string, optionLabel: string): Promise<void> {
    radio(groupLabel, optionLabel).click();
    fixture.detectChanges();
    await service.settled();
    fixture.detectChanges();
  }

  function chip(factor: string): HTMLInputElement {
    return host.querySelector(
      `[data-factor-chip="${factor}"] input[type="checkbox"]`,
    ) as HTMLInputElement;
  }

  // --- every group is a radiogroup ------------------------------------------

  it('when the toolbar renders, each segmented control is a labelled radiogroup', () => {
    for (const label of [
      'Market state lookback',
      'Rebalancing frequency',
      'Weighting mode',
      'Timing model',
      'Value spread metric',
    ]) {
      expect(group(label).getAttribute('role')).toBe('radiogroup');
    }
  });

  it('when the toolbar renders, the checked option of each group is the spec default', () => {
    expect(radio('Market state lookback', '36m').getAttribute('aria-checked')).toBe('true');
    expect(radio('Rebalancing frequency', 'Quarterly').getAttribute('aria-checked')).toBe('true');
    expect(radio('Weighting mode', 'Dynamic').getAttribute('aria-checked')).toBe('true');
    expect(
      radio('Timing model', 'Parsimonious, valuation + trend').getAttribute('aria-checked'),
    ).toBe('true');
    expect(radio('Value spread metric', 'Z-score').getAttribute('aria-checked')).toBe('true');
  });

  it('when the weighting group is arrowed, the selection moves without a second tab stop', async () => {
    const dynamic = radio('Weighting mode', 'Dynamic');
    dynamic.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowLeft', bubbles: true }));
    fixture.detectChanges();
    await service.settled();
    fixture.detectChanges();

    expect(service.weighting()).toBe('vol-scaled');
    expect(radio('Weighting mode', 'Vol-scaled').getAttribute('aria-checked')).toBe('true');
  });

  // --- the lookback is the shared engine's ---------------------------------

  it('when the lookback changes, it is the shared regime service that is written', async () => {
    await pick('Market state lookback', '12m');

    expect(regimes.momentumLookback()).toBe(12);
    expect(text('ft-lookback-note')).toContain('12 months');
    expect(text('ft-lookback-note')).toContain('shared regime engine');
  });

  // --- each control restates something --------------------------------------

  it('when the timing model changes, the definition beneath it follows', async () => {
    await pick('Timing model', 'Multi-signal panel');

    expect(service.timingModel()).toBe('multi-signal');
    expect(text('ft-model-definition')).toContain('panel regression');
  });

  it('when the value-spread metric changes, the caption says the measure is not unique', async () => {
    await pick('Value spread metric', 'P/B');

    expect(service.valueSpreadMetric()).toBe('price-book');
    expect(text('ft-metric-definition')).toContain('price-to-book');
    expect(text('ft-metric-definition')).toContain('can read ordinary on another');
  });

  // --- the stale badge ------------------------------------------------------

  it('when the toolbar renders, the stamp is read-only and carries no stale badge', () => {
    expect(text('ft-last-computed')).toContain('2026-07-31 06:00 UTC');
    expect(host.querySelector('[data-testid="ft-stale-badge"]')).toBeNull();
  });

  it('when a shorter interval is chosen, the stamp carries a Stale badge in words', async () => {
    await pick('Rebalancing frequency', 'Monthly');

    const badge = host.querySelector('[data-testid="ft-stale-badge"]');
    expect(badge?.textContent).toContain('Stale');
    expect(text('ft-stale-note')).toContain('older than the decision');
  });

  it('when the signals are re-run, the Stale badge goes', async () => {
    await pick('Rebalancing frequency', 'Monthly');
    expect(host.querySelector('[data-testid="ft-stale-badge"]')).toBeTruthy();

    await service.refresh();
    fixture.detectChanges();

    expect(host.querySelector('[data-testid="ft-stale-badge"]')).toBeNull();
  });

  // --- the factor chips -----------------------------------------------------

  it('when the toolbar renders, every factor is a checkbox and the count is live', () => {
    expect(chip('value').checked).toBe(true);
    expect(chip('profitability').checked).toBe(true);
    expect(host.querySelector('[data-testid="filter-chip-bar-count"]')?.textContent).toContain(
      '6 of 6 factors in view',
    );
  });

  it('when a factor is unticked, it leaves the view and the count follows', async () => {
    chip('size').click();
    fixture.detectChanges();
    await service.settled();
    fixture.detectChanges();

    expect(service.factorsInView()).not.toContain('size');
    expect(host.querySelector('[data-testid="filter-chip-bar-count"]')?.textContent).toContain(
      '5 of 6 factors in view',
    );
  });

  it('when the last factor would be unticked, the refusal is announced', async () => {
    service.setFactorsInView(['value']);
    await service.settled();
    fixture.detectChanges();

    chip('value').click();
    fixture.detectChanges();

    expect(text('ft-selection-error')).toContain(NO_FACTOR_SELECTED_ERROR);
    expect(host.querySelector('[data-testid="ft-selection-error"]')?.getAttribute('role')).toBe(
      'alert',
    );
    expect(service.factorsInView()).toEqual(['value']);
    // The refusal has to reach the box as well as the sentence: a tick that
    // cleared itself would say the factor had left the view when it had not.
    expect(chip('value').checked).toBe(true);
  });

  it('when a factor is toggled, the box that was pressed keeps the focus', async () => {
    const box = chip('quality');
    box.focus();
    expect(document.activeElement).toBe(box);

    box.click();
    fixture.detectChanges();

    // The run is in flight and every control is refusing input — but by
    // `aria-disabled`, not by the attribute that would drop focus to <body>.
    expect(box.getAttribute('aria-disabled')).toBe('true');
    expect(document.activeElement).toBe(box);

    await service.settled();
    fixture.detectChanges();
    expect(document.activeElement).toBe(box);
    expect(service.factorsInView()).not.toContain('quality');
  });

  it('while a run is in flight, a press on a factor box changes nothing', async () => {
    const run = service.refresh();
    fixture.detectChanges();

    const before = service.factorsInView();
    chip('size').click();
    fixture.detectChanges();

    expect(service.factorsInView()).toEqual(before);
    expect(chip('size').checked).toBe(true);

    await run;
    fixture.detectChanges();
  });

  // --- the loading state ----------------------------------------------------

  it('while a run is in flight, the controls stay in place and refuse input', async () => {
    const run = service.refresh();
    fixture.detectChanges();

    expect(radio('Weighting mode', 'Constant').getAttribute('aria-disabled')).toBe('true');
    expect(chip('value').getAttribute('aria-disabled')).toBe('true');
    // Never the attribute: it would take focus off whatever was pressed.
    expect(chip('value').disabled).toBe(false);
    // Still on screen — a control that vanishes takes the tab order with it.
    expect(host.querySelector('[data-testid="ft-last-computed"]')).toBeTruthy();

    await run;
    fixture.detectChanges();
    expect(radio('Weighting mode', 'Constant').getAttribute('aria-disabled')).toBeNull();
  });
});
