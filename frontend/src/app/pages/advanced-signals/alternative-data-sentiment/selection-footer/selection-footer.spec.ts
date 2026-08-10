/**
 * The footer counts the inclusion set and nothing else, refuses to send when it
 * is empty, and hands the ids over as candidates in the URL.
 */

import { ComponentFixture, TestBed } from '@angular/core/testing';
import { Router, provideRouter } from '@angular/router';
import { vi } from 'vitest';

import { AltDataSentimentService } from '../../../../services/alt-data-sentiment.service';
import { AltDataSelectionFooter } from './selection-footer';

describe('AltDataSelectionFooter', () => {
  let fixture: ComponentFixture<AltDataSelectionFooter>;
  let host: HTMLElement;
  let service: AltDataSentimentService;
  let router: Router;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [AltDataSelectionFooter],
      providers: [provideRouter([])],
    }).compileComponents();

    fixture = TestBed.createComponent(AltDataSelectionFooter);
    host = fixture.nativeElement;
    service = TestBed.inject(AltDataSentimentService);
    router = TestBed.inject(Router);
    fixture.detectChanges();
  });

  function cta(): HTMLButtonElement {
    return host.querySelector('[data-testid="ads-send-to-views"]') as HTMLButtonElement;
  }

  function count(): string {
    return (
      host
        .querySelector('[data-testid="ads-selection-count"]')
        ?.textContent?.replace(/\s+/g, ' ')
        .trim() ?? ''
    );
  }

  it('when the page opens, the count reads the inclusion set against the library', () => {
    expect(count()).toContain('3 of 6 signals selected');
    expect(count()).toContain('Global Equity Core');
  });

  it('when a card is included, the count and the button label follow it', () => {
    service.toggleInclude('social-mood');
    fixture.detectChanges();

    expect(count()).toContain('4 of 6');
    expect(cta().textContent).toContain('Send 4 to Views Builder');
  });

  it('when nothing is selected, the primary action refuses the press and says why', () => {
    const navigate = vi.spyOn(router, 'navigate').mockResolvedValue(true);
    for (const id of ['media-pessimism', 'retail-attention', 'news-analytics'] as const) {
      service.toggleInclude(id);
    }
    fixture.detectChanges();

    expect(cta().getAttribute('aria-disabled')).toBe('true');
    // Refusing, not disabled: the button keeps its place in the tab order so
    // the reason `aria-describedby` points at can actually be announced.
    expect(cta().disabled).toBe(false);
    expect(cta().getAttribute('aria-describedby')).toBe('ads-send-reason');
    expect(host.querySelector('#ads-send-reason')?.textContent).toContain('Select at least one');

    cta().click();

    expect(navigate).not.toHaveBeenCalled();
  });

  it('when a selection exists again, the action comes back without a reason attached', () => {
    for (const id of ['media-pessimism', 'retail-attention', 'news-analytics'] as const) {
      service.toggleInclude(id);
    }
    fixture.detectChanges();
    service.toggleInclude('tenk-tone');
    fixture.detectChanges();

    expect(cta().getAttribute('aria-disabled')).toBeNull();
    expect(cta().getAttribute('aria-describedby')).toBeNull();
  });

  it('when the universe puts every ticked signal out of reach, the count and the payload agree', async () => {
    const navigate = vi.spyOn(router, 'navigate').mockResolvedValue(true);

    service.setUniverse('em-frontier-small');
    await service.settled();
    fixture.detectChanges();

    expect(count()).toContain('0 of 0 signals selected');
    expect(cta().textContent).toContain('Send to Views Builder');
    expect(cta().getAttribute('aria-disabled')).toBe('true');

    cta().click();

    expect(navigate).not.toHaveBeenCalled();
  });

  it('when the action is pressed, the selected ids travel to Views Builder as candidates', () => {
    const navigate = vi.spyOn(router, 'navigate').mockResolvedValue(true);

    cta().click();

    expect(navigate).toHaveBeenCalledWith(
      ['/build/views-builder'],
      { queryParams: { candidates: 'media-pessimism,retail-attention,news-analytics' } },
    );
  });

  it('when the card driving the detail is not included, it is not sent', () => {
    const navigate = vi.spyOn(router, 'navigate').mockResolvedValue(true);
    expect(service.detailSignalId()).toBe('tenk-tone');

    cta().click();

    const params = navigate.mock.calls[0][1] as { queryParams: { candidates: string } };
    expect(params.queryParams.candidates).not.toContain('tenk-tone');
  });
});
