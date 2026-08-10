/**
 * The factor signal table.
 *
 * Four rules are held here, each of them a way the table could otherwise lie:
 * a factor with no history must read "insufficient history" rather than zero
 * and must not be ranked among the numbers; the conflicted row must be marked
 * with a word as well as a glyph; the expand trigger must be a button carrying
 * `aria-expanded` rather than the row itself; and the delta column must sum to
 * zero, because the tilt reallocates weight and never adds any.
 */

import { ComponentFixture, TestBed } from '@angular/core/testing';

import { FactorTimingService } from '../../../../services/factor-timing.service';
import { FactorSignalTable } from './factor-signal-table';

describe('FactorSignalTable', () => {
  let fixture: ComponentFixture<FactorSignalTable>;
  let host: HTMLElement;
  let service: FactorTimingService;

  beforeEach(async () => {
    await TestBed.configureTestingModule({ imports: [FactorSignalTable] }).compileComponents();

    fixture = TestBed.createComponent(FactorSignalTable);
    host = fixture.nativeElement;
    service = TestBed.inject(FactorTimingService);
    fixture.detectChanges();
  });

  function text(testId: string): string {
    return host.querySelector(`[data-testid="${testId}"]`)?.textContent?.replace(/\s+/g, ' ').trim() ?? '';
  }

  function rowOrder(): (string | null)[] {
    return Array.from(host.querySelectorAll('[data-signal-row]')).map((node) =>
      node.getAttribute('data-signal-row'),
    );
  }

  function cellText(selector: string): string {
    return host.querySelector(selector)?.textContent?.replace(/\s+/g, ' ').trim() ?? '';
  }

  function press(selector: string): void {
    (host.querySelector(selector) as HTMLElement).click();
    fixture.detectChanges();
  }

  // --- what the rows say ----------------------------------------------------

  it('when the table renders, each row carries its two signals and its tilt', () => {
    expect(cellText('[data-valuation="value"]')).toContain('favourable');
    expect(cellText('[data-trend="value"]')).toContain('unfavourable');
    expect(cellText('[data-tilt="value"]')).toContain('Tilt +');

    expect(cellText('[data-valuation="momentum"]')).toContain('unfavourable');
    expect(cellText('[data-trend="momentum"]')).toContain('favourable');
    expect(cellText('[data-tilt="momentum"]')).toContain('Tilt 0');
  });

  it('when the table renders, the weights are the ones the wireframe prints', () => {
    const row = host.querySelector('[data-signal-row="value"]')?.textContent ?? '';
    expect(row).toContain('12%');
    expect(row).toContain('16%');
    expect(row).toContain('+4');
  });

  // --- insufficient history -------------------------------------------------

  it('when a factor has too little history, it says so instead of showing a score', () => {
    const marker = host.querySelector('[data-insufficient="profitability"]');
    expect(marker?.textContent).toContain('insufficient history');

    // No score anywhere on the row, and no zero standing in for one.
    expect(host.querySelector('[data-valuation="profitability"]')).toBeNull();
    expect(host.querySelector('[data-tilt="profitability"]')).toBeNull();
    const row = host.querySelector('[data-signal-row="profitability"]')?.textContent ?? '';
    expect(row).not.toContain('0%');
  });

  it('when a factor is excluded, the table says it is out of the composite', () => {
    const note = host.querySelector('[data-excluded-note="profitability"]')?.textContent ?? '';
    expect(note).toContain('excluded from the composite');
  });

  it('when the delta column sorts, the unscored row stays at the bottom either way', () => {
    press('[data-testid="ft-sort-delta"]');
    expect(rowOrder()[rowOrder().length - 1]).toBe('profitability');

    press('[data-testid="ft-sort-delta"]');
    expect(rowOrder()[rowOrder().length - 1]).toBe('profitability');
  });

  // --- sorting --------------------------------------------------------------

  it('when a column header is pressed, the sort state is announced on the header', () => {
    const header = () =>
      host.querySelector('[data-testid="ft-sort-delta"]')?.closest('th') as HTMLElement;

    expect(header().getAttribute('aria-sort')).toBe('none');

    press('[data-testid="ft-sort-delta"]');
    expect(header().getAttribute('aria-sort')).toBe('descending');

    press('[data-testid="ft-sort-delta"]');
    expect(header().getAttribute('aria-sort')).toBe('ascending');
  });

  it('when the delta column sorts descending, the largest overweight leads', () => {
    press('[data-testid="ft-sort-delta"]');
    expect(rowOrder()[0]).toBe('value');
  });

  it('when the timing column sorts, the ranking follows the timing weight', () => {
    press('[data-testid="ft-sort-timing"]');
    expect(rowOrder()[0]).toBe('value');
    expect(rowOrder().indexOf('size')).toBeGreaterThan(rowOrder().indexOf('quality'));
  });

  // --- the conflict marker --------------------------------------------------

  it('when a row conflicts, it is marked with a word and not only a glyph', () => {
    const marker = host.querySelector('[data-conflict="momentum"]')?.textContent ?? '';
    expect(marker).toContain('trend vs valuation conflict');

    expect(host.querySelector('[data-conflict="value"]')).toBeNull();
    expect(host.querySelector('[data-conflict="size"]')).toBeNull();
  });

  it('when a row conflicts, the footnote names it as the callout’s source', () => {
    const note = host.querySelector('[data-conflict-note="momentum"]')?.textContent ?? '';
    expect(note).toContain('neither wins');
    expect(note).toContain('extrapolation callout');
  });

  // --- expanding ------------------------------------------------------------

  it('when a row is expanded, the trigger is a button that announces its state', () => {
    const button = () => host.querySelector('[data-expand="value"]') as HTMLButtonElement;

    expect(button().tagName).toBe('BUTTON');
    expect(button().getAttribute('aria-expanded')).toBe('false');
    expect(host.querySelector('[data-drivers-row="value"]')).toBeNull();

    press('[data-expand="value"]');

    expect(button().getAttribute('aria-expanded')).toBe('true');
    expect(button().getAttribute('aria-controls')).toBe('ft-drivers-value');
    expect(host.querySelector('#ft-drivers-value')).toBeTruthy();
  });

  it('when a row is expanded, every predictor category is listed with its horizon', () => {
    press('[data-expand="value"]');

    for (const category of ['financial', 'macro', 'sentiment', 'valuation', 'trend']) {
      expect(host.querySelector(`[data-driver="value-${category}"]`)).toBeTruthy();
    }
    expect(cellText('[data-driver="value-financial"]')).toContain('horizon 6m+');
    expect(cellText('[data-driver="value-valuation"]')).toContain('horizon 3–5y');
  });

  it('when the model ignores a category, the expanded row says so rather than hiding it', () => {
    press('[data-expand="value"]');

    expect(cellText('[data-driver="value-macro"]')).toContain('not used by this model');
    expect(cellText('[data-driver="value-valuation"]')).not.toContain('not used by this model');
  });

  it('when the row with no history is expanded, its drivers are dashes and not zeros', () => {
    press('[data-expand="profitability"]');

    expect(cellText('[data-driver="profitability-valuation"]')).toContain('—');
    expect(cellText('[data-driver="profitability-valuation"]')).not.toContain('0.00');
  });

  // --- the tilts sum to zero ------------------------------------------------

  it('when the table renders, the delta column totals zero and says so', () => {
    expect(text('ft-total-delta')).toBe('0');
    expect(text('ft-total-current')).toBe(text('ft-total-timing'));
    expect(text('ft-tilt-sum')).toContain('never add any');
  });

  it('when the timing model changes, the deltas change and still total zero', async () => {
    const before = text('ft-total-timing');

    service.setTimingModel('multi-signal');
    await service.settled();
    fixture.detectChanges();

    expect(text('ft-total-delta')).toBe('0');
    expect(text('ft-total-timing')).toBe(before);
  });
});
