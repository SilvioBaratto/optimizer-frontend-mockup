/**
 * The six current readings.
 *
 * The rule the grid exists to hold is that a raised marker names the quantity
 * that raised it, and that the threshold it names is a function of the size of
 * the universe rather than a number on screen. Both are checked here through
 * the rendered card, not through the service.
 */

import { ComponentFixture, TestBed } from '@angular/core/testing';

import { chiSquaredThreshold, TurbulenceService } from '../../../../services/turbulence.service';
import { IndicatorGrid } from './indicator-grid';

describe('IndicatorGrid', () => {
  let fixture: ComponentFixture<IndicatorGrid>;
  let host: HTMLElement;
  let service: TurbulenceService;

  beforeEach(async () => {
    await TestBed.configureTestingModule({ imports: [IndicatorGrid] }).compileComponents();

    fixture = TestBed.createComponent(IndicatorGrid);
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

  function value(id: string): string {
    return (
      host.querySelector(`[data-testid="indicator-value-${id}"]`)?.textContent ?? ''
    ).trim();
  }

  function cardOf(id: string): HTMLElement {
    const element = host.querySelector(`[data-testid="indicator-value-${id}"]`);
    return element?.closest('app-entity-card') as HTMLElement;
  }

  function badges(): string[] {
    return Array.from(host.querySelectorAll('app-status-badge')).map((badge) =>
      (badge.textContent ?? '').trim(),
    );
  }

  it('when the grid renders, the label is a heading and the six cards are in spec order', () => {
    const heading = host.querySelector('h2');
    expect(heading?.textContent?.trim()).toBe('CURRENT READING');

    const titles = Array.from(host.querySelectorAll('app-entity-card')).map((card) =>
      (card.querySelectorAll('span')[1]?.textContent ?? '').trim(),
    );
    expect(titles).toEqual([
      'Turbulence',
      'Magnitude surprise',
      'Correlation surprise',
      'Absorption ratio',
      'Effective rank',
      'PC1 variance share',
    ]);
  });

  it('when the grid renders, none of the cards is a link or a button', () => {
    expect(host.querySelector('app-entity-card a')).toBeNull();
    expect(host.querySelector('app-entity-card button')).toBeNull();
  });

  it('when the turbulence is above its threshold, the badge names the threshold and the count', () => {
    const threshold = chiSquaredThreshold(24) / 24;
    expect(value('turbulence')).toBe('2.31');
    expect(cardOf('turbulence').textContent).toContain(
      `above the chi2 threshold of ${threshold.toFixed(2)} for 24 assets`,
    );
  });

  it('when the universe changes size, the threshold in the badge moves with it', () => {
    const before = (chiSquaredThreshold(24) / 24).toFixed(2);
    service.selectUniverse('multi-asset-24-rebuilt');
    fixture.detectChanges();
    expect(text()).toContain(before);

    service.selectUniverse('core-sleeve-12');
    fixture.detectChanges();

    // 14.84 at twelve series — the doc's own worked example, over n.
    expect(chiSquaredThreshold(12)).toBeCloseTo(14.845, 2);
    expect(text()).toContain('of a raw rank of 12');
    expect(text()).not.toContain(`chi2 threshold of ${before}`);
  });

  it('when a universe sits under its own threshold, the turbulence card raises nothing', () => {
    service.selectUniverse('core-sleeve-12');
    fixture.detectChanges();

    expect(cardOf('turbulence').textContent).toContain('○');
    expect(cardOf('turbulence').querySelector('app-status-badge')).toBeNull();
  });

  it('when only two conditions are met, only two cards carry a badge', () => {
    // Turbulence past its chi-squared line, and dAR at or past one sigma.
    expect(badges().length).toBe(2);
    expect(badges()[0]).toContain('above the chi2 threshold');
    expect(badges()[1]).toContain('ΔAR 15d vs 1y +1.2σ');
  });

  it('when a card raises nothing, its status is a hollow marker and a word, not a colour', () => {
    const card = cardOf('correlation-surprise');
    const status = card.querySelector('[data-testid="indicator-status-correlation-surprise"]');
    expect(status?.textContent).toContain('○');
    expect(status?.textContent).toContain('typical co-movement');
  });

  it('when the readings are recomputing, placeholders stand in for the six values', async () => {
    const run = service.refresh();
    fixture.detectChanges();

    expect(host.querySelectorAll('app-skeleton-block').length).toBe(6);
    expect(host.querySelector('[data-testid="indicator-value-turbulence"]')).toBeNull();

    await run;
    fixture.detectChanges();
    expect(host.querySelectorAll('app-skeleton-block').length).toBe(0);
  });
});
