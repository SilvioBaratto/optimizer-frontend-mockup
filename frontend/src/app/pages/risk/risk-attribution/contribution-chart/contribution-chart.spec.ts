/**
 * Region 4 — the contribution figure.
 *
 * The bars are elements rather than a canvas precisely so these behaviours can
 * exist at all: every bar carries its own number in text, a bar is a control
 * that opens the detail panel, and the two reference figures beside the bars
 * are the TOTAL row's, not a second sum taken over whatever is on screen.
 */

import { ComponentFixture, TestBed } from '@angular/core/testing';

import { RiskAttributionService } from '../../../../services/risk-attribution.service';
import { ContributionChart } from './contribution-chart';

describe('ContributionChart', () => {
  let fixture: ComponentFixture<ContributionChart>;
  let host: HTMLElement;
  let service: RiskAttributionService;

  beforeEach(async () => {
    await TestBed.configureTestingModule({ imports: [ContributionChart] }).compileComponents();
    fixture = TestBed.createComponent(ContributionChart);
    host = fixture.nativeElement;
    service = TestBed.inject(RiskAttributionService);
    fixture.detectChanges();
  });

  function bars(): HTMLButtonElement[] {
    return Array.from(host.querySelectorAll('[data-bar]'));
  }

  function barIds(): string[] {
    return bars().map((b) => b.getAttribute('data-bar') ?? '');
  }

  function bar(id: string): HTMLButtonElement {
    const found = host.querySelector(`[data-bar="${id}"]`);
    expect(found).not.toBeNull();
    return found as HTMLButtonElement;
  }

  function showAll(): void {
    const control = Array.from(host.querySelectorAll('button')).find((b) =>
      b.textContent?.includes('Show all'),
    )!;
    control.click();
    fixture.detectChanges();
  }

  // --- order and readability ------------------------------------------------

  it('when the figure renders, the bars are in descending order of Euler contribution', () => {
    expect(barIds().slice(0, 5)).toEqual(['NVDA', 'AAPL', 'MSFT', 'AMZN', 'GOOGL']);
  });

  it('when the figure renders, the ordering follows Euler even under the Marginal method', async () => {
    const before = barIds();
    await service.setMethod('marginal');
    fixture.detectChanges();

    expect(barIds()).toEqual(before);
  });

  it('when the figure renders, every bar prints its own figure as text', () => {
    for (const button of bars()) {
      expect(button.textContent).toMatch(/-?\d+\.\d%/);
      expect(button.textContent).toMatch(/-?\$[\d,]+/);
    }
  });

  it('when the figure renders, the largest bar reads exactly as the table does', () => {
    expect(bar('AAPL').textContent).toContain('10.1%');
    expect(bar('AAPL').textContent).toContain('$421,300');
  });

  it('when a component reduces total risk, its bar carries the glyph and the word', () => {
    showAll();
    expect(bar('TLT').textContent).toContain('▼');
    expect(bar('TLT').textContent).toContain('hedge');
    expect(bar('TLT').textContent).toContain('-0.8%');
  });

  // --- the two reference figures --------------------------------------------

  it('when the figure renders, it prints Σ stand-alone and the diversification benefit', () => {
    const reference = host.querySelector('[data-testid="chart-reference"]')!;
    expect(reference.textContent).toContain('$5,808,800');
    expect(reference.textContent).toContain('+28.0%');
  });

  it('when the display switches to %, the reference figure follows the switch', () => {
    service.displayUnit.set('percent');
    fixture.detectChanges();

    // 5,808,800 over a 30,000,000 book.
    expect(host.querySelector('[data-testid="chart-reference"]')?.textContent).toContain('19.4%');
  });

  it('when the figure renders, its summary states the reading in one sentence', () => {
    const summary = host.querySelector('.sr-only')?.textContent ?? '';
    expect(summary).toContain('26 components ranked by Euler contribution');
    expect(summary).toContain('NVDA');
    expect(summary).toContain('$5,808,800');
  });

  // --- selection ------------------------------------------------------------

  it('when a bar is activated, that component is selected and the bar says so', () => {
    bar('MSFT').click();
    fixture.detectChanges();

    expect(service.selectedComponentId()).toBe('MSFT');
    expect(bar('MSFT').getAttribute('aria-pressed')).toBe('true');
    expect(bar('AAPL').getAttribute('aria-pressed')).toBe('false');
  });

  it('when the selected bar is activated again, the selection is cleared', () => {
    bar('MSFT').click();
    fixture.detectChanges();
    bar('MSFT').click();
    fixture.detectChanges();

    expect(service.selectedComponentId()).toBeNull();
  });

  it('when a bar is rendered, it names the panel it controls', () => {
    expect(bar('AAPL').getAttribute('aria-controls')).toBe('risk-attribution-detail');
  });

  // --- the twelve-bar cap ---------------------------------------------------

  it('when the book is long, the figure opens on the twelve largest contributions', () => {
    expect(bars()).toHaveLength(12);
    expect(host.textContent).toContain('Show all 26 bars');
  });

  it('when the rest is asked for, every component gets a bar', () => {
    showAll();
    expect(bars()).toHaveLength(26);
    expect(barIds().at(-1)).toBe('TLT');
  });

  it('when a small component is selected elsewhere, its bar is shown without expanding', () => {
    expect(barIds()).not.toContain('CASH');

    service.selectComponent('CASH');
    fixture.detectChanges();

    expect(barIds()).toContain('CASH');
    expect(bar('CASH').getAttribute('aria-pressed')).toBe('true');
  });

  it('when the grouping is short, no expander is offered', async () => {
    await service.setGrouping('factor');
    fixture.detectChanges();

    expect(bars()).toHaveLength(4);
    expect(host.textContent).not.toContain('Show all');
  });

  // --- loading --------------------------------------------------------------

  it('while a recompute runs, placeholder bars stand in for the figure', async () => {
    const pending = service.recompute(false, 'grouping');
    fixture.detectChanges();

    const skeleton = host.querySelector('[data-testid="chart-skeleton"]');
    expect(skeleton?.getAttribute('aria-busy')).toBe('true');
    expect(host.querySelector('[data-bar]')).toBeNull();

    await pending;
  });
});
