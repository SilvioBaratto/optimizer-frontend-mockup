/**
 * Region 6 — the diversification indices.
 *
 * The one thing this suite exists to prevent is a hardcoded number. Every
 * assertion about a figure compares the DOM against `RiskAttributionService`'s
 * own computed signal, so a literal typed into the template — even the right
 * one for today's seed — fails the moment the book behind it changes. Doc 19
 * owns these measures; this page shows them.
 */

import { ComponentFixture, TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';

import { HIGH_CONCENTRATION_DI } from '../../../../models/guardrail.model';
import { GuardrailService } from '../../../../services/guardrail.service';
import { RiskAttributionService } from '../../../../services/risk-attribution.service';
import { ConcentrationPanel } from './concentration-panel';

describe('ConcentrationPanel', () => {
  let fixture: ComponentFixture<ConcentrationPanel>;
  let host: HTMLElement;
  let service: GuardrailService;
  let attribution: RiskAttributionService;

  beforeEach(async () => {
    vi.useFakeTimers();
    await TestBed.configureTestingModule({
      imports: [ConcentrationPanel],
      providers: [provideRouter([])],
    }).compileComponents();
    fixture = TestBed.createComponent(ConcentrationPanel);
    host = fixture.nativeElement;
    service = TestBed.inject(GuardrailService);
    attribution = TestBed.inject(RiskAttributionService);
    fixture.detectChanges();
  });

  afterEach(() => vi.useRealTimers());

  async function settle(): Promise<void> {
    await vi.advanceTimersByTimeAsync(5_000);
    fixture.detectChanges();
  }

  function cards(): HTMLElement[] {
    return Array.from(host.querySelectorAll('[data-component]'));
  }

  function di(): string {
    return (host.querySelector('[data-testid="portfolio-di"]')?.textContent ?? '').trim();
  }

  function showAll(): HTMLButtonElement {
    return host.querySelector('[data-testid="show-all-components"]') as HTMLButtonElement;
  }

  // --- the figures come from Risk Attribution -------------------------------

  it('when the card renders, the portfolio index is the one Risk Attribution computes', () => {
    expect(di()).toBe(attribution.portfolioDi().toFixed(2));
  });

  it('when Risk Attribution recomputes, this card follows rather than keeping its own number', async () => {
    const before = di();

    const pending = attribution.setMeasure('es');
    await settle();
    await pending;
    fixture.detectChanges();

    expect(di()).toBe(attribution.portfolioDi().toFixed(2));
    expect(di()).not.toBe(before);
  });

  it('when a component card renders, its marginal index is the row’s own', () => {
    const entries = new Map(
      attribution.marginalDiByComponent().map((e) => [e.id, e.marginalDi]),
    );

    for (const card of cards()) {
      const id = card.getAttribute('data-component') as string;
      const printed = (
        host.querySelector(`[data-marginal-di="${id}"]`)?.textContent ?? ''
      ).trim();
      const expected = entries.get(id);
      expect(printed).toBe(expected === null || expected === undefined ? '—' : expected.toFixed(2));
    }
  });

  it('when the card renders, it says the measures are read rather than recomputed', () => {
    expect(host.textContent).toContain('does not recompute the measures');
  });

  // --- the preview and the full book ---------------------------------------

  it('when the grid renders, it previews the heaviest components and offers the rest', () => {
    expect(cards()).toHaveLength(4);
    expect(showAll().textContent).toContain(
      `Show all components (${service.concentrationHidden()} more)`,
    );
    expect(showAll().getAttribute('aria-expanded')).toBe('false');
  });

  it('when Show all is pressed, every component of the book appears', () => {
    showAll().click();
    fixture.detectChanges();

    expect(cards()).toHaveLength(service.concentrationComponents().length);
    expect(cards().length).toBeGreaterThan(4);
    expect(showAll().getAttribute('aria-expanded')).toBe('true');
    expect(showAll().textContent).toContain('Show fewer components');
  });

  it('when the grid is expanded, the cards are ordered heaviest first', () => {
    showAll().click();
    fixture.detectChanges();

    const order = cards().map((c) => c.getAttribute('data-component'));
    expect(order).toEqual(service.concentrationComponents().map((c) => c.id));
  });

  // --- flagging a concentration --------------------------------------------

  it('when a component is nearly co-monotonic with the book, it is flagged with a word', () => {
    showAll().click();
    fixture.detectChanges();

    const flagged = service
      .concentrationComponents()
      .filter((c) => c.marginalDi !== null && c.marginalDi >= HIGH_CONCENTRATION_DI);

    expect(flagged.length).toBeGreaterThan(0);
    for (const component of flagged) {
      const badge = host.querySelector(`[data-high="${component.id}"]`);
      expect(badge?.textContent).toContain('High concentration');
    }
  });

  it('when a component is not flagged, no high-concentration badge is rendered for it', () => {
    showAll().click();
    fixture.detectChanges();

    const calm = service
      .concentrationComponents()
      .filter((c) => c.marginalDi !== null && c.marginalDi < HIGH_CONCENTRATION_DI);

    for (const component of calm) {
      expect(host.querySelector(`[data-high="${component.id}"]`)).toBeNull();
    }
  });

  it('when a component is a hedge, the index is a dash with a reason, never a zero', () => {
    showAll().click();
    fixture.detectChanges();

    const hedges = service.concentrationComponents().filter((c) => c.hedge);
    expect(hedges.length).toBeGreaterThan(0);

    for (const component of hedges) {
      expect(host.querySelector(`[data-hedge="${component.id}"]`)?.textContent).toContain('Hedge');
      expect(
        (host.querySelector(`[data-marginal-di="${component.id}"]`)?.textContent ?? '').trim(),
      ).toBe('—');
    }
    expect(host.textContent).toContain('the Euler contribution is negative');
  });

  it('when the card renders, the high-concentration count matches the flagged components', () => {
    expect(
      (host.querySelector('[data-testid="high-concentration-count"]')?.textContent ?? '').trim(),
    ).toBe(String(service.highConcentrationCount()));
  });

  // --- the exit -------------------------------------------------------------

  it('when the card renders, it carries the exit to Risk Attribution', () => {
    const link = host.querySelector('app-info-card a') as HTMLAnchorElement;
    expect(link.textContent).toContain('Open Risk Attribution');
    expect(link.getAttribute('href')).toBe('/risk/risk-attribution');
  });

  // --- states ---------------------------------------------------------------

  it('while the page reads, placeholders stand in for the index and the grid', async () => {
    const pending = service.refresh();
    fixture.detectChanges();

    expect(host.querySelector('[data-testid="portfolio-di"]')).toBeNull();
    expect(cards()).toHaveLength(0);
    expect(host.querySelectorAll('app-skeleton-block').length).toBeGreaterThan(0);

    await settle();
    await pending;
  });

  it('when the indices cannot be read, the failure is localised to this region', async () => {
    const pending = service.refresh(['concentration']);
    await settle();
    await pending;
    fixture.detectChanges();

    expect(host.querySelector('[data-testid="concentration-error"]')?.textContent).toContain(
      'Could not read the diversification indices.',
    );
    expect(host.querySelector('[data-testid="portfolio-di"]')).toBeNull();
  });
});
