/**
 * The scope bar: a combobox that returns focus to its trigger on Escape, and a
 * window that is validated rather than clamped — a refused range leaves the
 * previous one in force and says what has to change.
 */

import { ComponentFixture, TestBed } from '@angular/core/testing';

import { AltDataSentimentService } from '../../../../services/alt-data-sentiment.service';
import { AltDataScopeBar } from './scope-bar';

describe('AltDataScopeBar', () => {
  let fixture: ComponentFixture<AltDataScopeBar>;
  let host: HTMLElement;
  let service: AltDataSentimentService;

  beforeEach(async () => {
    await TestBed.configureTestingModule({ imports: [AltDataScopeBar] }).compileComponents();

    fixture = TestBed.createComponent(AltDataScopeBar);
    host = fixture.nativeElement;
    service = TestBed.inject(AltDataSentimentService);
    document.body.appendChild(host);
    fixture.detectChanges();
  });

  afterEach(() => {
    host.remove();
  });

  function trigger(): HTMLButtonElement {
    return host.querySelector('[data-testid="ads-universe-trigger"]') as HTMLButtonElement;
  }

  function dateField(which: 'start' | 'end'): HTMLInputElement {
    return host.querySelector(`[data-testid="ads-coverage-${which}"]`) as HTMLInputElement;
  }

  function setDate(which: 'start' | 'end', value: string): void {
    const field = dateField(which);
    field.value = value;
    field.dispatchEvent(new Event('change'));
    fixture.detectChanges();
  }

  // --- the universe picker ---------------------------------------------------

  it('when the bar renders, the trigger is a closed combobox naming the current universe', () => {
    expect(trigger().getAttribute('role')).toBe('combobox');
    expect(trigger().getAttribute('aria-expanded')).toBe('false');
    expect(trigger().textContent).toContain('Global Equity Core');
  });

  it('when the picker is opened, the options are a listbox with the current one selected', () => {
    trigger().click();
    fixture.detectChanges();

    expect(trigger().getAttribute('aria-expanded')).toBe('true');
    const options = Array.from(host.querySelectorAll('#ads-universe-listbox [role="option"]'));
    expect(options).toHaveLength(4);
    expect(options[0].getAttribute('aria-selected')).toBe('true');
  });

  it('when the search field narrows the list, only the matching universes stay', () => {
    trigger().click();
    fixture.detectChanges();

    const search = host.querySelector('#ads-universe-search') as HTMLInputElement;
    search.value = 'europe';
    search.dispatchEvent(new Event('input'));
    fixture.detectChanges();

    expect(host.querySelectorAll('#ads-universe-listbox [role="option"]')).toHaveLength(1);
  });

  it('when Escape closes the picker, focus goes back to the trigger it came from', () => {
    trigger().click();
    fixture.detectChanges();
    (host.querySelector('#ads-universe-search') as HTMLInputElement).focus();

    host.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
    fixture.detectChanges();

    expect(trigger().getAttribute('aria-expanded')).toBe('false');
    expect(document.activeElement).toBe(trigger());
  });

  it('when a universe is chosen, the scope moves and the picker closes', () => {
    trigger().click();
    fixture.detectChanges();

    (host.querySelector('[data-universe="us-large-cap"]') as HTMLButtonElement).click();
    fixture.detectChanges();

    expect(service.universeId()).toBe('us-large-cap');
    expect(trigger().getAttribute('aria-expanded')).toBe('false');
  });

  // --- the coverage window ---------------------------------------------------

  it('when the window ends before it starts, the range is refused and the old one stands', () => {
    setDate('end', '2010-01-01');

    expect(service.coverageEnd()).toBe('2026-07-31');
    expect(host.querySelector('[data-testid="ads-coverage-error"]')?.textContent).toContain(
      'on or after the start date',
    );
    expect(dateField('end').getAttribute('aria-invalid')).toBe('true');
  });

  it('when the window ends past the last feed update, the range is refused too', () => {
    setDate('end', '2027-01-01');

    expect(host.querySelector('[data-testid="ads-coverage-error"]')?.textContent).toContain(
      'cannot end after 2026-07-31',
    );
  });

  it('when a valid window is chosen, the message clears and the window moves', async () => {
    setDate('start', '2020-01-01');
    await service.settled();
    fixture.detectChanges();

    expect(service.coverageStart()).toBe('2020-01-01');
    expect(host.querySelector('[data-testid="ads-coverage-error"]')).toBeNull();
  });

  // --- freshness -------------------------------------------------------------

  it('when the feeds are summarised, the failed and stale ones are counted in words', () => {
    const summary = host.querySelector('[data-testid="ads-feed-summary"]')?.textContent ?? '';
    expect(summary).toContain('1 failed');
    expect(summary).toContain('1 past its cadence');
    expect(summary).toContain('partial coverage');
    expect(host.querySelector('[data-testid="ads-feeds-updated"]')?.textContent).toContain(
      '2026-07-31 18:00 UTC',
    );
  });
});
