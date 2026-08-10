/**
 * The exercise run backwards: fix the outcome, read off the plausibility it
 * costs. The panel has to state that plausibility against the radius currently
 * in force, name the implied scenario's drivers in words, and treat "no
 * plausible radius reaches this" as an answer rather than a crash.
 */

import { ComponentFixture, TestBed } from '@angular/core/testing';

import {
  EMPTY_REVERSE_MESSAGE,
  REVERSE_UNREACHABLE_MESSAGE,
  STALE_RESULT_BADGE,
} from '../../../../models/stress-testing.model';
import { StressTestingService } from '../../../../services/stress-testing.service';
import { ReversePanel } from './reverse-panel';

function settle(ms = 800): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

describe('ReversePanel', () => {
  let fixture: ComponentFixture<ReversePanel>;
  let host: HTMLElement;
  let service: StressTestingService;

  beforeEach(async () => {
    await TestBed.configureTestingModule({ imports: [ReversePanel] }).compileComponents();

    fixture = TestBed.createComponent(ReversePanel);
    host = fixture.nativeElement;
    service = TestBed.inject(StressTestingService);
    document.body.appendChild(host);
    fixture.detectChanges();
  });

  afterEach(() => {
    host.remove();
  });

  function byTestId(id: string): HTMLElement | null {
    return host.querySelector(`[data-testid="${id}"]`);
  }

  function text(id: string): string {
    return byTestId(id)?.textContent?.replace(/\s+/g, ' ').trim() ?? '';
  }

  function outcome(): HTMLSelectElement {
    return host.querySelector('#st-reverse-outcome') as HTMLSelectElement;
  }

  function target(): HTMLInputElement {
    return host.querySelector('#st-reverse-target') as HTMLInputElement;
  }

  function searchButton(): HTMLButtonElement {
    return byTestId('search-reverse') as HTMLButtonElement;
  }

  function chooseOutcome(value: string): void {
    outcome().value = value;
    outcome().dispatchEvent(new Event('change'));
    fixture.detectChanges();
  }

  function typeTarget(value: string): void {
    target().value = value;
    target().dispatchEvent(new Event('change'));
    fixture.detectChanges();
  }

  async function searchFor(level: string): Promise<void> {
    typeTarget(level);
    searchButton().click();
    fixture.detectChanges();
    await settle();
    fixture.detectChanges();
  }

  // --- the empty state -------------------------------------------------------

  it('when nothing has been searched, the Result waits and the action is inert', () => {
    expect(host.textContent).toContain(EMPTY_REVERSE_MESSAGE);
    expect(searchButton().disabled).toBe(true);
    expect(target().value).toBe('');
    expect(target().getAttribute('placeholder')).toBe('8.0');
    expect(outcome().value).toBe('capital-ratio-breach');
  });

  it('when the panel renders, the target level is stated in the toolbar’s impact measure', () => {
    expect(text('reverse-target-unit')).toBe('% RWA');
    expect(text('reverse-context')).toContain('Regulatory capital / RWA');
    expect(text('reverse-context')).toContain('13.3% RWA');

    service.setImpactMeasure('asset-values');
    fixture.detectChanges();
    expect(text('reverse-target-unit')).toBe('% NAV');
  });

  it('when the outcome changes, its definition and its current reading follow', () => {
    chooseOutcome('illiquidity');

    expect(text('reverse-context')).toContain('12.5% RWA');
    expect(text('reverse-context')).toContain('The funding position closes');
  });

  // --- the search ------------------------------------------------------------

  it('when a breach is searched for, the panel reports the plausibility it costs', async () => {
    await searchFor('8');

    expect(text('reverse-maha')).toBe('4.10');
    expect(text('reverse-required-radius')).toBe('k >= 4.10');
    expect(host.textContent).toContain('a loss of 5.3 pts');
    expect(text('reverse-verdict')).toContain('already inside the current Ell_k');
  });

  it('when the search has run, the implied scenario names its drivers in words', async () => {
    await searchFor('8');

    const roles = Array.from(host.querySelectorAll('[data-implied]')).map((row) => ({
      id: row.getAttribute('data-implied'),
      text: row.textContent?.replace(/\s+/g, ' ').trim() ?? '',
    }));

    expect(roles).toHaveLength(4);
    expect(roles.find((r) => r.id === 'fx-eurusd')?.text).toContain('key driver');
    expect(roles.find((r) => r.id === 'equity')?.text).toContain('key driver');
    // Nothing is pinned in a reverse search, so no factor sits at a
    // conditional expected value: the small ones are small *moves*, and
    // the panel says which they are rather than claiming they were left alone.
    expect(roles.find((r) => r.id === 'credit-spread')?.text).toContain('minor move');
    expect(roles.find((r) => r.id === 'credit-spread')?.text).not.toContain(
      'conditional expected value',
    );
    expect(text('implied-scenario-note')).toContain('Nothing is pinned in a reverse search');
    // The FX leg moves with the dollar and the equity leg falls: signs, in text.
    expect(roles.find((r) => r.id === 'equity')?.text).toContain('−');
    expect(roles.find((r) => r.id === 'fx-eurusd')?.text).toContain('+');
  });

  it('when the radius is tighter than the answer, the verdict says a forward search would miss it', async () => {
    service.setK(2);
    fixture.detectChanges();

    await searchFor('8');

    expect(text('reverse-verdict')).toContain('too tight to contain it');
  });

  it('while the search runs, the Result is a placeholder and the action is busy', async () => {
    typeTarget('8');
    searchButton().focus();
    searchButton().click();
    fixture.detectChanges();

    expect(byTestId('reverse-skeleton')?.getAttribute('aria-busy')).toBe('true');
    expect(searchButton().getAttribute('aria-disabled')).toBe('true');
    expect(searchButton().getAttribute('aria-busy')).toBe('true');
    // `aria-disabled`, not `disabled`: the reader keeps the button they pressed.
    expect(searchButton().disabled).toBe(false);
    expect(document.activeElement).toBe(searchButton());

    await settle();
    fixture.detectChanges();
    expect(byTestId('reverse-skeleton')).toBeNull();
    expect(searchButton().getAttribute('aria-disabled')).toBeNull();
  });

  // --- the outcome that is not a scenario ------------------------------------

  it('when survival itself is the outcome, the panel says no plausible radius reaches it', async () => {
    chooseOutcome('insolvency');
    await searchFor('0');

    const alert = host.querySelector('[role="alert"]');
    expect(alert?.textContent).toContain(REVERSE_UNREACHABLE_MESSAGE);
    expect(alert?.textContent).toContain('it is a different institution');
    expect(alert?.querySelector('button')?.textContent).toContain('Retry');
    expect(host.textContent).toContain(EMPTY_REVERSE_MESSAGE);
  });

  it('when the target is at or above the current reading, the refusal explains itself', async () => {
    await searchFor('14');

    expect(host.querySelector('[role="alert"]')?.textContent).toContain(
      'Enter a level below the current one.',
    );
  });

  it('when the failed search is retried, focus leaves the alert before it is destroyed', async () => {
    chooseOutcome('insolvency');
    await searchFor('0');

    const retry = host.querySelector('[role="alert"] button') as HTMLButtonElement;
    retry.focus();
    retry.click();
    fixture.detectChanges();

    // The alert the button lived in is gone; focus must not fall to <body>.
    expect(document.activeElement).toBe(host.querySelector('h3'));
    expect(document.activeElement?.textContent?.trim()).toBe('Result');

    await settle();
    fixture.detectChanges();
  });

  it('when a reachable target replaces an unreachable one, the retry converges', async () => {
    chooseOutcome('insolvency');
    await searchFor('0');
    expect(host.querySelector('[role="alert"]')).not.toBeNull();

    chooseOutcome('capital-ratio-breach');
    await searchFor('8');

    expect(host.querySelector('[role="alert"]')).toBeNull();
    expect(text('reverse-maha')).toBe('4.10');
  });

  // --- the central rule, and saving ------------------------------------------

  it('when a toolbar parameter moves, the Result is badged and its figures stand', async () => {
    await searchFor('8');

    service.setImpactMeasure('asset-values');
    fixture.detectChanges();

    expect(text('reverse-maha')).toBe('4.10');
    expect(byTestId('reverse-stale')?.textContent).toContain(STALE_RESULT_BADGE);
    expect(host.textContent).toContain('Computed in % RWA');
  });

  it('when the reverse result is saved, the library keeps it as a reverse row', async () => {
    await searchFor('8');

    (byTestId('reverse-save') as HTMLButtonElement).click();
    fixture.detectChanges();

    expect(service.library()).toHaveLength(5);
    expect(service.library()[4].kind).toBe('reverse');
    expect(service.library()[4].reverse?.targetLevel).toBe(8);
  });
});
