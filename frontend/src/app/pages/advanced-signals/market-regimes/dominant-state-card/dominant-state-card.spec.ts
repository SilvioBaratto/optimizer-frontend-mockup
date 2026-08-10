/**
 * The hero card — the reading the whole page is anchored to.
 *
 * Two things are being proved here. That every state's probability is legible
 * as text and not only as a bar length, and that the state list is the selected
 * model's own — four rows under the VAR, two under Hamilton — because three
 * regions read that same list and none of them may disagree about how many
 * states there are.
 */

import { ComponentFixture, TestBed } from '@angular/core/testing';

import { EMPTY_TITLE } from '../../../../models/market-regimes.model';
import { MarketRegimesService } from '../../../../services/market-regimes.service';
import { DominantStateCard } from './dominant-state-card';

describe('DominantStateCard', () => {
  let fixture: ComponentFixture<DominantStateCard>;
  let host: HTMLElement;
  let service: MarketRegimesService;

  beforeEach(async () => {
    await TestBed.configureTestingModule({ imports: [DominantStateCard] }).compileComponents();

    fixture = TestBed.createComponent(DominantStateCard);
    host = fixture.nativeElement;
    service = TestBed.inject(MarketRegimesService);
    fixture.detectChanges();
  });

  function text(testId: string): string {
    return host.querySelector(`[data-testid="${testId}"]`)?.textContent?.replace(/\s+/g, ' ').trim() ?? '';
  }

  /** Each probability row as `state percentage`, in the order it is drawn. */
  function rows(): string[] {
    return Array.from(host.querySelectorAll('[data-testid="mr-probability-bars"] li')).map(
      (row) => (row.textContent ?? '').replace(/\s+/g, ' ').trim(),
    );
  }

  async function settle(): Promise<void> {
    await service.settled();
    fixture.detectChanges();
  }

  // --- the reading ----------------------------------------------------------

  it('when the card renders, the heading is the state and its probability', () => {
    expect(host.querySelector('h2')?.textContent?.trim()).toBe('Crash 58%');
    expect(host.querySelector('.eyebrow')?.textContent).toContain('Filtered');
    expect(host.querySelector('.eyebrow')?.textContent).toContain('4-Regime Multi-Asset (VAR)');
  });

  it('when the card renders, the three qualifiers sit beside the state', () => {
    expect(text('mr-dominant-meta')).toBe(
      'most likely since 2026-06 · stationary 9% · expected duration 2 mo',
    );
  });

  it('when the card renders, every state carries its own percentage as text', () => {
    expect(rows()).toEqual([
      'Crash 58% most likely',
      'Slow Growth 20%',
      'Bull 12%',
      'Recovery 10%',
    ]);
  });

  it('when the card renders, the modal state is named in words and not only marked', () => {
    const modal = host.querySelector('[data-state="Crash"]');
    expect(modal?.getAttribute('aria-current')).toBe('true');
    expect(text('mr-modal-flag')).toBe('most likely');
  });

  it('when the card renders, each bar is decoration and the number beside it is the value', () => {
    const track = host.querySelector('[data-state="Crash"] span[aria-hidden="true"]');
    expect(track).toBeTruthy();
    expect((track?.firstElementChild as HTMLElement).style.width).toBe('58%');
  });

  it('when the card renders, each state takes its own fill from a class Tailwind can see', () => {
    // Written out in full, never interpolated: an interpolated `bg-${token}` is
    // invisible to the v4 source scan and the rule is silently never emitted,
    // which would leave every bar unfilled.
    const fills = ['Crash', 'Slow Growth', 'Bull', 'Recovery'].map((state) =>
      Array.from(
        (
          host.querySelector(`[data-state="${state}"] span[aria-hidden="true"] > span`) as HTMLElement
        ).classList,
      ).filter((name) => name.startsWith('bg-')),
    );
    expect(fills).toEqual([['bg-primary'], ['bg-signature'], ['bg-warning'], ['bg-info']]);
  });

  it('when the smoother is chosen, this reading does not move and the card says why', async () => {
    service.setProbabilityBasis('smoothed');
    await settle();

    // P[s_T | I_T] is the filtered probability: at the last month of the sample
    // the smoother has no future data to condition on.
    expect(host.querySelector('h2')?.textContent?.trim()).toBe('Crash 58%');
    expect(host.querySelector('.eyebrow')?.textContent).toContain('Filtered');
    expect(text('mr-smoother-note')).toContain('no future data to condition on');
    // And the run it names is the same run: a smoothed "most likely since" a
    // year back beside "expected duration 2 mo" is one line contradicting itself.
    expect(text('mr-dominant-meta')).toBe(
      'most likely since 2026-06 · stationary 9% · expected duration 2 mo',
    );
  });

  // --- the model decides how many states there are --------------------------

  it('when the regime model drops to two states, so does the card', async () => {
    service.setModel('hamilton');
    await settle();

    expect(rows()).toEqual(['Recession 61% most likely', 'Expansion 39%']);
    expect(host.querySelector('h2')?.textContent?.trim()).toBe('Recession 61%');
  });

  // --- the universe moves the reading ---------------------------------------

  it('when the universe changes, the state in front changes with it', async () => {
    service.setUniverse('equities-only');
    await settle();

    expect(host.querySelector('h2')?.textContent?.trim()).toBe('Bull 56%');
    expect(text('mr-modal-flag')).toBe('most likely');
  });

  // --- the empty combination ------------------------------------------------

  it('when no combination can be estimated, the card explains it and offers a way out', async () => {
    service.setUniverse('em-equities');
    await settle();

    expect(service.state()).toBe('empty');
    expect(text('mr-dominant-empty')).toContain(EMPTY_TITLE);
    expect(text('mr-dominant-empty')).toContain('fewer than 24 months');
    expect(text('mr-dominant-empty')).toContain('Universe control in the toolbar');
    expect(host.querySelector('[data-testid="mr-probability-bars"]')).toBeNull();
  });

  it('when widening the window cannot help, the card offers the action that can', async () => {
    service.setUniverse('em-equities');
    await settle();

    // The window is already the whole axis, so "reset the sample window" would
    // change nothing and leave the page exactly as empty as it was. It is not
    // offered; the other way out the spec names is, and it is a real control.
    expect(service.sampleFrom()).toBe('1990-01');
    expect(service.sampleTo()).toBe('2026-07');
    expect(host.querySelector('[data-testid="mr-reset-window"]')).toBeNull();

    const escape = host.querySelector('[data-testid="mr-switch-universe"]') as HTMLButtonElement;
    expect(escape.textContent).toContain('Equities + Bonds');
    escape.click();
    fixture.detectChanges();
    await settle();

    expect(service.state()).toBe('ready');
    expect(host.querySelector('h2')?.textContent?.trim()).toBe('Crash 58%');
  });

  it('when the reset action is used, the sample window goes back to the whole sample', async () => {
    service.setSampleFrom('2026-06');
    await settle();
    service.setSampleTo('2026-05');
    fixture.detectChanges();
    expect(service.state()).toBe('empty');

    (host.querySelector('[data-testid="mr-reset-window"]') as HTMLButtonElement).click();
    fixture.detectChanges();
    await settle();

    expect(service.sampleFrom()).toBe('1990-01');
    expect(service.sampleTo()).toBe('2026-07');
    expect(host.querySelector('h2')?.textContent?.trim()).toBe('Crash 58%');
  });
});
