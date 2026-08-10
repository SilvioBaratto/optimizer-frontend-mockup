/**
 * The toolbar, and the two things it has to get right.
 *
 * The radius is one value with two views, so a move of either has to show up in
 * the other and in the definition of `Ell_k` beside them; and both of the
 * toolbar's parameters mark every result stale without recomputing anything,
 * which is the whole page's central rule and is enforced here, at the control.
 */

import { ComponentFixture, TestBed } from '@angular/core/testing';

import { K_MAX, K_MIN, STALE_RESULT_NOTE } from '../../../../models/stress-testing.model';
import { StressTestingService } from '../../../../services/stress-testing.service';
import { StressToolbar } from './stress-toolbar';

function settle(ms = 800): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

describe('StressToolbar', () => {
  let fixture: ComponentFixture<StressToolbar>;
  let host: HTMLElement;
  let service: StressTestingService;

  beforeEach(async () => {
    await TestBed.configureTestingModule({ imports: [StressToolbar] }).compileComponents();

    fixture = TestBed.createComponent(StressToolbar);
    host = fixture.nativeElement;
    service = TestBed.inject(StressTestingService);
    document.body.appendChild(host);
    fixture.detectChanges();
  });

  afterEach(() => {
    host.remove();
  });

  function field(): HTMLInputElement {
    return host.querySelector('#st-k') as HTMLInputElement;
  }

  function slider(): HTMLInputElement {
    return host.querySelector('#st-k-slider') as HTMLInputElement;
  }

  function measure(): HTMLSelectElement {
    return host.querySelector('#st-impact-measure') as HTMLSelectElement;
  }

  function byTestId(id: string): HTMLElement | null {
    return host.querySelector(`[data-testid="${id}"]`);
  }

  function text(id: string): string {
    return byTestId(id)?.textContent?.trim() ?? '';
  }

  function typeRadius(value: string): void {
    field().value = value;
    field().dispatchEvent(new Event('change'));
    fixture.detectChanges();
  }

  function dragRadius(value: string): void {
    slider().value = value;
    slider().dispatchEvent(new Event('input'));
    fixture.detectChanges();
  }

  function press(key: string): void {
    slider().dispatchEvent(new KeyboardEvent('keydown', { key }));
    fixture.detectChanges();
  }

  // --- shape -----------------------------------------------------------------

  it('when the toolbar renders, it carries the defaults the spec sets', () => {
    expect(measure().value).toBe('regulatory-capital');
    expect(field().value).toBe('5.00');
    expect(slider().value).toBe('5');
    expect(text('ellipsoid-definition')).toBe('Ell_k = { r : Maha(r) <= 5.00 }');
    expect(text('measure-unit')).toContain('% RWA');
  });

  it('when the toolbar renders, both views of the radius are labelled controls', () => {
    expect(host.querySelector('label[for="st-impact-measure"]')?.textContent?.trim()).toBe(
      'Impact measure',
    );
    expect(host.querySelector('label[for="st-k"]')?.textContent?.trim()).toBe(
      'Plausibility radius k',
    );
    expect(host.querySelector('label[for="st-k-slider"]')).not.toBeNull();
  });

  it('when the slider renders, it states its range, its position and what that position means', () => {
    expect(slider().getAttribute('aria-valuemin')).toBe(String(K_MIN));
    expect(slider().getAttribute('aria-valuemax')).toBe(String(K_MAX));
    expect(slider().getAttribute('aria-valuenow')).toBe('5');
    expect(slider().getAttribute('aria-valuetext')).toBe('Mahalanobis radius 5.00, Ell_5.00');
  });

  // --- one value, two views --------------------------------------------------

  it('when the slider is dragged, the number field and the definition follow it', () => {
    dragRadius('7.5');

    expect(field().value).toBe('7.50');
    expect(text('k-readout')).toBe('7.50');
    expect(text('ellipsoid-definition')).toBe('Ell_k = { r : Maha(r) <= 7.50 }');
    expect(slider().getAttribute('aria-valuetext')).toBe('Mahalanobis radius 7.50, Ell_7.50');
    expect(service.k()).toBe(7.5);
  });

  it('when the number field is typed into, the slider follows it', () => {
    typeRadius('3.25');

    expect(slider().value).toBe('3.25');
    expect(service.k()).toBe(3.25);
  });

  it('when a radius outside the range is typed, it is clamped and the field says so', () => {
    typeRadius('40');

    expect(service.k()).toBe(K_MAX);
    expect(field().value).toBe('12.00');

    typeRadius('0');
    expect(service.k()).toBe(K_MIN);
    expect(field().value).toBe('0.50');
  });

  it('when the field is cleared, the radius is left where it was', () => {
    typeRadius('');

    expect(service.k()).toBe(5);
    expect(field().value).toBe('5.00');
  });

  // --- the slider's keyboard -------------------------------------------------

  it('when End and Home are pressed, the slider reaches the ends exactly', () => {
    press('End');
    expect(service.k()).toBe(K_MAX);
    expect(field().value).toBe('12.00');

    press('Home');
    expect(service.k()).toBe(K_MIN);
    expect(field().value).toBe('0.50');
  });

  it('when an arrow key is pressed, the radius moves by the declared step', () => {
    press('ArrowRight');
    expect(service.k()).toBe(5.05);

    press('ArrowLeft');
    press('ArrowLeft');
    expect(service.k()).toBe(4.95);
  });

  it('when Page keys are pressed, the radius jumps ten steps', () => {
    press('PageUp');
    expect(service.k()).toBe(5.5);

    press('PageDown');
    expect(service.k()).toBe(5);
  });

  it('when an arrow is pressed with a modifier, the chord is left to the platform', () => {
    slider().dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowRight', ctrlKey: true }));
    fixture.detectChanges();

    expect(service.k()).toBe(5);
  });

  // --- the central rule ------------------------------------------------------

  it('when the radius moves after a search, the toolbar says nothing was recomputed', async () => {
    await service.runWorstCase();
    fixture.detectChanges();
    expect(byTestId('toolbar-stale-note')).toBeNull();

    dragRadius('8');

    expect(byTestId('toolbar-stale-note')?.textContent).toContain(STALE_RESULT_NOTE);
    expect(service.worstCaseResult()?.stale).toBe(true);
    // The figures are untouched: only the flag moved.
    expect(service.worstCaseResult()?.k).toBe(5);
    expect(service.worstCaseResult()?.maha).toBe(5);
  });

  it('when the impact measure moves after a search, the unit on screen moves and the result does not', async () => {
    await service.runWorstCase();
    fixture.detectChanges();

    measure().value = 'liquidity-gap';
    measure().dispatchEvent(new Event('change'));
    fixture.detectChanges();

    expect(service.impactMeasure()).toBe('liquidity-gap');
    expect(text('measure-unit')).toContain('% of 30-day net outflows');
    expect(service.worstCaseResult()?.unit).toBe('% RWA');
    expect(byTestId('toolbar-stale-note')).not.toBeNull();
  });

  it('when the radius is set to the value it already has, nothing goes stale', async () => {
    await service.runWorstCase();
    fixture.detectChanges();

    dragRadius('5');

    expect(byTestId('toolbar-stale-note')).toBeNull();
  });

  // --- the two actions -------------------------------------------------------

  it('when nothing has been computed, Save scenario is inert and says why', () => {
    expect((byTestId('save-scenario') as HTMLButtonElement).disabled).toBe(true);
    expect(host.textContent).toContain('the library stores a result, not a set of controls');
  });

  it('when a search has run, Save scenario adds the result to the library', async () => {
    await service.runWorstCase();
    fixture.detectChanges();

    expect((byTestId('save-scenario') as HTMLButtonElement).disabled).toBe(false);
    (byTestId('save-scenario') as HTMLButtonElement).click();
    fixture.detectChanges();

    expect(service.library()).toHaveLength(5);
    expect(service.library()[4].kind).toBe('worst-case');
  });

  it('when the bar is read from the other tab, Save scenario names the result it would store', async () => {
    await service.runWorstCase();
    service.setMode('reverse');
    fixture.detectChanges();

    // The worst case is on the tab the reader just left, so an unqualified
    // "Save scenario" would write a row for something not on screen.
    expect(byTestId('save-scenario')?.textContent).toContain('worst case');
    expect(text('savable-note')).toContain('worst case');

    service.setFactorFixed('equity', true);
    service.setFactorValue('equity', -12);
    await service.evaluateManual();
    fixture.detectChanges();
    expect(byTestId('save-scenario')?.textContent).toContain('manual');
    expect(text('savable-note')).toContain('manual');
  });

  it('while the search runs, every control is visible and refuses input', async () => {
    (byTestId('run-worst-case') as HTMLButtonElement).click();
    fixture.detectChanges();

    expect(byTestId('run-worst-case')?.getAttribute('aria-disabled')).toBe('true');
    expect(byTestId('run-worst-case')?.getAttribute('aria-busy')).toBe('true');
    expect(measure().disabled).toBe(true);
    expect(field().disabled).toBe(true);
    expect(slider().disabled).toBe(true);
    expect(host.textContent).toContain('Unavailable while a search is running.');

    await settle();
    fixture.detectChanges();
    expect(measure().disabled).toBe(false);
    expect(byTestId('run-worst-case')?.getAttribute('aria-disabled')).toBeNull();
    expect(service.worstCaseResult()?.maha).toBe(5);
  });

  it('while the search runs, the button that started it keeps the focus and refuses a second press', async () => {
    const run = byTestId('run-worst-case') as HTMLButtonElement;
    run.focus();
    run.click();
    fixture.detectChanges();

    // `disabled` here would take the button out of the tab order under the
    // reader's finger and drop focus to <body> for the whole search.
    expect(run.disabled).toBe(false);
    expect(document.activeElement).toBe(run);

    // Focusable means clickable, so the handler is what has to refuse: a
    // second press must not restart the search nor move the tab under it.
    service.setMode('reverse');
    run.click();
    fixture.detectChanges();
    expect(service.mode()).toBe('reverse');
    expect(service.pendingAction()).toBe('worst-case');
    service.setMode('forward');

    await settle();
    fixture.detectChanges();
    expect(document.activeElement).toBe(run);
    expect(service.worstCaseResult()?.maha).toBe(5);
  });

  it('when the primary action is used from the reverse tab, it puts the page back where the result lands', () => {
    service.setMode('reverse');
    fixture.detectChanges();

    (byTestId('run-worst-case') as HTMLButtonElement).click();
    fixture.detectChanges();

    expect(service.mode()).toBe('forward');
  });
});
