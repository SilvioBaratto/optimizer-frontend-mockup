/**
 * The as-of bar, and the one distinction it has to keep: the windows it prints
 * are estimation windows, and the age beside the stamp is a fact about the data
 * rather than a styling of it.
 */

import { ComponentFixture, TestBed } from '@angular/core/testing';

import { TurbulenceService } from '../../../../services/turbulence.service';
import { SnapshotBar } from './snapshot-bar';

describe('SnapshotBar', () => {
  let fixture: ComponentFixture<SnapshotBar>;
  let host: HTMLElement;
  let service: TurbulenceService;

  beforeEach(async () => {
    await TestBed.configureTestingModule({ imports: [SnapshotBar] }).compileComponents();

    fixture = TestBed.createComponent(SnapshotBar);
    host = fixture.nativeElement;
    service = TestBed.inject(TurbulenceService);
    document.body.appendChild(host);
    fixture.detectChanges();
  });

  afterEach(() => {
    host.remove();
  });

  function text(): string {
    return host.textContent ?? '';
  }

  function values(): string[] {
    return Array.from(host.querySelectorAll('[data-testid="metric-value"]')).map((element) =>
      (element.textContent ?? '').trim(),
    );
  }

  function notes(): string[] {
    return Array.from(host.querySelectorAll('[data-testid="metric-note"]')).map((element) =>
      (element.textContent ?? '').trim(),
    );
  }

  it('when the bar renders, it prints the stamp, the asset count and both estimation windows', () => {
    expect(values()).toEqual(['2026-07-30 16:00 UTC', '24 assets', '500d', '100 obs']);
    expect(notes()[2]).toContain('half-life 250d');
    expect(notes()[2]).toContain('5 eigenvectors');
    expect(notes()[3]).toContain('700 days');
  });

  it('when the snapshot is inside the cadence, its age is beside the stamp with no badge', () => {
    expect(notes()[0]).toBe('Snapshot age 18h, within the expected cadence');
    expect(text()).not.toContain('Dated snapshot');
  });

  it('when the snapshot is older than the cadence, the bar says so in words beside the stamp', () => {
    service.ageSnapshot(40);
    fixture.detectChanges();

    expect(notes()[0]).toBe('Snapshot age 40h, older than the expected 24h cadence');
    expect(text()).toContain('Dated snapshot — 40h old');
  });

  it('when the universe changes size, the asset count and the eigenvector count follow it', () => {
    service.selectUniverse('core-sleeve-12');
    fixture.detectChanges();

    expect(values()[1]).toBe('12 assets');
    expect(notes()[2]).toContain('2 eigenvectors');
  });

  it('when a refresh is in flight, the control refuses input and says it is busy', async () => {
    const button = host.querySelector('app-refresh-control button') as HTMLButtonElement;
    expect(button.getAttribute('aria-disabled')).toBeNull();

    const run = service.refresh();
    fixture.detectChanges();
    // aria-disabled rather than disabled, so the reader who pressed this button
    // keeps their focus while the read is in flight; the component refuses the
    // second press itself.
    expect(button.getAttribute('aria-disabled')).toBe('true');
    expect(button.disabled).toBe(false);
    expect(button.getAttribute('aria-busy')).toBe('true');

    await run;
    fixture.detectChanges();
    expect(button.getAttribute('aria-disabled')).toBeNull();
  });

  it('when the bar renders, it is the same context bar every other page uses', () => {
    // It used to stick from its own host with the metrics row drawing its own
    // card. That stuck, but a card is sized to the content column while a
    // context bar bleeds past the page gutter — measured at 1440, 803/1200
    // against the bar's 771/1264, so the panels scrolled visibly through the
    // 32px strip on each side as they passed underneath.
    const contextBar = host.querySelector('app-page-context-bar');
    expect(contextBar).not.toBeNull();
    expect(contextBar!.querySelector('app-key-metrics-row')).not.toBeNull();
  });

  it('when the bar renders, the metrics row draws no card of its own', () => {
    // The context bar around it already owns a surface; a second one would
    // paint a white panel on the page surface and nest `.surface-card`'s
    // below-`sm` bleed inside the bar's.
    const surface = host.querySelector('app-key-metrics-row > div');
    expect(surface!.className).not.toContain('surface-card');
  });

  it('when the viewport is narrow, the bar is in flow rather than pinned over the panels', () => {
    // Four metrics collapse to one column below `sm` and the bar measures 410px
    // at 320px wide — pinned, it would hold half an 800px viewport and most of
    // a 320x568 phone. That judgement now lives on PageContextBar, so every
    // page shares it rather than this one differing.
    const contextBar = host.querySelector('app-page-context-bar')!;
    expect(contextBar.className).toContain('md:sticky');
    expect(contextBar.className).not.toMatch(/(^|\s)sticky(\s|$)/);
  });

  it('when a refresh completes, the stamp moves forward and the age resets', async () => {
    await service.refresh();
    fixture.detectChanges();

    expect(values()[0]).toBe('2026-07-30 17:00 UTC');
    expect(notes()[0]).toBe('Snapshot age 0h, within the expected cadence');
  });
});
