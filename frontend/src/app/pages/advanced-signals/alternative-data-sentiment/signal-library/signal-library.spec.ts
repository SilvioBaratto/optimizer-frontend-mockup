/**
 * The grid, and the distinction the whole page turns on: `aria-selected` is the
 * card driving the detail panel, `aria-checked` is the card being handed to
 * Views Builder, and the two are moved by different keys.
 *
 * Also here: a failed feed keeps its card, its badge carries the timestamp of
 * the last good extract, and nothing about the card is disabled.
 */

import { ComponentFixture, TestBed } from '@angular/core/testing';

import { AltDataSentimentService } from '../../../../services/alt-data-sentiment.service';
import { AltDataSignalLibrary } from './signal-library';

describe('AltDataSignalLibrary', () => {
  let fixture: ComponentFixture<AltDataSignalLibrary>;
  let host: HTMLElement;
  let service: AltDataSentimentService;

  beforeEach(async () => {
    await TestBed.configureTestingModule({ imports: [AltDataSignalLibrary] }).compileComponents();

    fixture = TestBed.createComponent(AltDataSignalLibrary);
    host = fixture.nativeElement;
    service = TestBed.inject(AltDataSentimentService);
    document.body.appendChild(host);
    fixture.detectChanges();
  });

  afterEach(() => {
    host.remove();
  });

  function options(): HTMLElement[] {
    return Array.from(host.querySelectorAll('[role="option"]'));
  }

  function option(id: string): HTMLElement {
    const found = host.querySelector(`[data-signal="${id}"]`);
    expect(found).not.toBeNull();
    return found as HTMLElement;
  }

  function press(id: string, key: string): void {
    option(id).dispatchEvent(new KeyboardEvent('keydown', { key, bubbles: true }));
    fixture.detectChanges();
  }

  // --- the grid --------------------------------------------------------------

  it('when the grid renders, every card is a listbox option with a selected state', () => {
    expect(host.querySelector('[role="listbox"]')).not.toBeNull();
    expect(options()).toHaveLength(6);
    for (const card of options()) {
      expect(card.hasAttribute('aria-selected')).toBe(true);
    }
    expect(option('tenk-tone').getAttribute('aria-selected')).toBe('true');
    expect(option('media-pessimism').getAttribute('aria-selected')).toBe('false');
  });

  it('when the page opens, the card driving the detail is not one of the included ones', () => {
    expect(option('tenk-tone').getAttribute('aria-selected')).toBe('true');
    expect(option('tenk-tone').getAttribute('aria-checked')).toBe('false');
    expect(option('media-pessimism').getAttribute('aria-checked')).toBe('true');
  });

  // --- selection is not inclusion --------------------------------------------

  it('when Space is pressed on a card, it is included and the detail card does not move', () => {
    press('social-mood', ' ');

    expect(option('social-mood').getAttribute('aria-checked')).toBe('true');
    expect(option('social-mood').getAttribute('aria-selected')).toBe('false');
    expect(option('tenk-tone').getAttribute('aria-selected')).toBe('true');
    expect(service.detailSignalId()).toBe('tenk-tone');
  });

  it('when Space is pressed twice on a card, it leaves the hand-over set again', () => {
    press('social-mood', ' ');
    press('social-mood', ' ');

    expect(option('social-mood').getAttribute('aria-checked')).toBe('false');
    expect(service.includedCount()).toBe(3);
  });

  it('when Enter is pressed on a card, it drives the detail and its inclusion is untouched', () => {
    const includedBefore = [...service.includedIds()];

    press('social-mood', 'Enter');

    expect(option('social-mood').getAttribute('aria-selected')).toBe('true');
    expect(option('tenk-tone').getAttribute('aria-selected')).toBe('false');
    expect(option('social-mood').getAttribute('aria-checked')).toBe('false');
    expect([...service.includedIds()]).toEqual(includedBefore);
  });

  it('when Enter moves the selection, the page is told so it can move focus with it', () => {
    const activated: string[] = [];
    fixture.componentInstance.activated.subscribe((id) => activated.push(id));

    press('news-analytics', 'Enter');

    expect(activated).toEqual(['news-analytics']);
  });

  it('when an arrow key is pressed, focus moves and neither state changes', () => {
    const selectedBefore = service.detailSignalId();
    const includedBefore = [...service.includedIds()];

    press('tenk-tone', 'ArrowDown');

    expect(document.activeElement).toBe(option('retail-attention'));
    expect(service.detailSignalId()).toBe(selectedBefore);
    expect([...service.includedIds()]).toEqual(includedBefore);
  });

  it('when the grid is tabbed into, the tab stop is on the card driving the detail', () => {
    expect(option('tenk-tone').getAttribute('tabindex')).toBe('0');
    expect(option('media-pessimism').getAttribute('tabindex')).toBe('-1');
  });

  it('when a card is clicked, it drives the detail panel', () => {
    option('aggregate-sentiment').click();
    fixture.detectChanges();

    expect(service.detailSignalId()).toBe('aggregate-sentiment');
    expect(service.isIncluded('aggregate-sentiment')).toBe(false);
  });

  it('when the include control is clicked, inclusion changes and the detail card does not', () => {
    const include = option('social-mood').querySelector(
      '[data-include="social-mood"]',
    ) as HTMLButtonElement;

    include.click();
    fixture.detectChanges();

    expect(service.isIncluded('social-mood')).toBe(true);
    expect(service.detailSignalId()).toBe('tenk-tone');
  });

  // --- the failed feed -------------------------------------------------------

  it('when a feed has failed, its card carries an error badge with the last good timestamp', () => {
    const badge = option('retail-attention').querySelector('[data-feed="retail-attention"]');
    expect(badge?.textContent).toContain('Feed error');
    expect(badge?.textContent).toContain('2026-07-29 18:00 UTC');
  });

  it('when a feed has failed, the card stays selectable and is not disabled', () => {
    const card = option('retail-attention');
    expect(card.getAttribute('role')).toBe('option');
    expect(card.hasAttribute('aria-disabled')).toBe(false);

    press('retail-attention', 'Enter');

    expect(card.getAttribute('aria-selected')).toBe('true');
    expect(service.detailSignalId()).toBe('retail-attention');
  });

  it('when a signal covers only part of the window, the badge sits beside the percentage', () => {
    const card = option('retail-attention');
    expect(card.textContent).toContain('cov. 91%');
    expect(card.querySelector('[data-partial="retail-attention"]')?.textContent).toContain(
      'partial coverage',
    );
    expect(option('media-pessimism').querySelector('[data-partial="media-pessimism"]')).toBeNull();
  });

  it('when a feed has run past its cadence, the card says so in words beside the date', () => {
    const badge = option('social-mood').querySelector('[data-feed="social-mood"]');
    expect(badge?.textContent).toContain('Feed stale');
    expect(option('social-mood').textContent).toContain('updated 2026-07-24');
  });

  it('when a card is announced, its whole state is in the label the option carries', () => {
    const label = option('retail-attention').getAttribute('aria-label') ?? '';
    expect(label).toContain('Retail Attention (ASVI)');
    expect(label).toContain('coverage 91%, partial coverage');
    expect(label).toContain('Feed error — last good 2026-07-29 18:00 UTC');
    expect(label).toContain('Transient');
  });

  // --- the legend ------------------------------------------------------------

  it('when the legend renders, every classification is a word and not only a colour', () => {
    const legend = host.querySelector('[data-testid="ads-legend"]')?.textContent ?? '';
    for (const word of ['Transient', 'Persistent', 'Mixed', 'Regime', 'Lag 2-6d', 'Feed error']) {
      expect(legend).toContain(word);
    }
  });

  // --- the filters -----------------------------------------------------------

  it('when a category chip is switched off, it says so and its cards leave the grid', () => {
    const chip = host.querySelector('[data-category="tone"]') as HTMLButtonElement;
    expect(chip.getAttribute('aria-pressed')).toBe('true');

    chip.click();
    fixture.detectChanges();

    expect(chip.getAttribute('aria-pressed')).toBe('false');
    expect(host.querySelector('[data-signal="tenk-tone"]')).toBeNull();
    expect(options()).toHaveLength(4);
  });

  it('when the search field is typed into, the count and the grid narrow together', () => {
    const search = host.querySelector('input[type="search"]') as HTMLInputElement;
    search.value = 'attention';
    search.dispatchEvent(new Event('input'));
    fixture.detectChanges();

    expect(options()).toHaveLength(1);
    expect(host.querySelector('[data-testid="filter-chip-bar-count"]')?.textContent).toContain(
      '1 of 6',
    );
  });

  it('when only the ML chip is left on, the grid explains where the ML work lives', () => {
    for (const category of ['tone', 'attention', 'mood', 'news', 'regime']) {
      (host.querySelector(`[data-category="${category}"]`) as HTMLButtonElement).click();
      fixture.detectChanges();
    }

    expect(options()).toHaveLength(0);
    expect(host.querySelector('[data-testid="ads-empty-ml"]')?.textContent).toContain(
      'ML Aggregation tab',
    );
  });

  it('when the search matches nothing, the empty result is explained rather than left blank', () => {
    const search = host.querySelector('input[type="search"]') as HTMLInputElement;
    search.value = 'nothing here';
    search.dispatchEvent(new Event('input'));
    fixture.detectChanges();

    expect(host.querySelector('[data-testid="ads-empty-filters"]')).not.toBeNull();
  });

  it('when the empty result is on screen, its action puts the grid back', () => {
    const search = host.querySelector('input[type="search"]') as HTMLInputElement;
    search.value = 'nothing here';
    search.dispatchEvent(new Event('input'));
    (host.querySelector('[data-category="tone"]') as HTMLButtonElement).click();
    fixture.detectChanges();

    (host.querySelector('[data-testid="ads-empty-filters-action"]') as HTMLButtonElement).click();
    fixture.detectChanges();

    expect(options()).toHaveLength(6);
    expect(search.value).toBe('');
    expect(host.querySelector('[data-category="tone"]')?.getAttribute('aria-pressed')).toBe('true');
  });

  it('when one chip is carrying the filter, it says why it will not switch off', () => {
    for (const category of ['attention', 'mood', 'news', 'ml', 'regime']) {
      (host.querySelector(`[data-category="${category}"]`) as HTMLButtonElement).click();
      fixture.detectChanges();
    }

    const last = host.querySelector('[data-category="tone"]') as HTMLButtonElement;
    expect(last.getAttribute('aria-disabled')).toBe('true');
    expect(last.getAttribute('aria-describedby')).toBe('ads-category-rule');
    expect(host.querySelector('[data-testid="ads-category-rule"]')?.textContent).toContain(
      'At least one category stays selected',
    );

    // The refusal is stated, not silent: pressing it again changes nothing.
    last.click();
    fixture.detectChanges();

    expect(last.getAttribute('aria-pressed')).toBe('true');
    expect(options()).toHaveLength(2);
  });

  it('when nothing is filtering, the rule line is mounted and empty so it can be announced', () => {
    const region = host.querySelector('#ads-category-rule');
    expect(region).not.toBeNull();
    expect(region?.getAttribute('role')).toBe('status');
    expect(region?.textContent?.trim()).toBe('');
  });

  // --- the empty scope -------------------------------------------------------

  it('when the universe is out of reach of every feed, the grid says which of the two it is', async () => {
    service.setUniverse('em-frontier-small');
    await service.settled();
    fixture.detectChanges();

    expect(host.querySelector('[data-testid="ads-empty-universe"]')).not.toBeNull();
    expect(host.querySelector('[data-testid="ads-empty-window"]')).toBeNull();
  });

  it('when the universe has no coverage, the empty state offers a universe that has', async () => {
    service.setUniverse('em-frontier-small');
    await service.settled();
    fixture.detectChanges();

    const action = host.querySelector(
      '[data-testid="ads-empty-universe-action"]',
    ) as HTMLButtonElement;
    expect(action.textContent).toContain('Global Equity Core');

    action.click();
    await service.settled();
    fixture.detectChanges();

    expect(service.universeId()).toBe('global-equity-core');
    expect(options()).toHaveLength(6);
  });

  it('when the window excludes every feed, the empty state widens it back', async () => {
    service.setCoverageStart('1960-01-01');
    await service.settled();
    service.setCoverageEnd('1962-01-01');
    await service.settled();
    fixture.detectChanges();

    expect(host.querySelector('[data-testid="ads-empty-window"]')).not.toBeNull();

    (host.querySelector('[data-testid="ads-empty-window-action"]') as HTMLButtonElement).click();
    await service.settled();
    fixture.detectChanges();

    expect(options()).toHaveLength(6);
  });
});
