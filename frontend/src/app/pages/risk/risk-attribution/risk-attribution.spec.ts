/**
 * The page as a whole: the six regions in reading order, the four states, and
 * the two claims the spec singles out — the TOTAL row's figures are the ones
 * every other panel quotes, and a selection made in one view is the same
 * selection in the other.
 *
 * Nothing is stubbed. The contribution figure and the factor panel draw real
 * elements rather than a canvas, so the whole page renders in jsdom and the
 * focus round trip between a bar, the slide-over and back is testable.
 */

import { ComponentFixture, TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';

import { ICON_PROVIDER } from '../../../icons';
import {
  RiskAttributionService,
  SINGLE_NAME_PORTFOLIO_ID,
} from '../../../services/risk-attribution.service';
import { RiskAttribution } from './risk-attribution';

describe('RiskAttribution page', () => {
  let fixture: ComponentFixture<RiskAttribution>;
  let host: HTMLElement;
  let service: RiskAttributionService;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [RiskAttribution],
      providers: [provideRouter([]), ICON_PROVIDER],
    }).compileComponents();

    fixture = TestBed.createComponent(RiskAttribution);
    host = fixture.nativeElement;
    service = TestBed.inject(RiskAttributionService);
    document.body.appendChild(host);
    fixture.detectChanges();
  });

  afterEach(() => {
    host.remove();
  });

  function buttons(): HTMLButtonElement[] {
    return Array.from(host.querySelectorAll('button'));
  }

  function buttonLabelled(text: string): HTMLButtonElement {
    const match = buttons().find((b) => (b.textContent ?? '').includes(text));
    expect(match).toBeTruthy();
    return match as HTMLButtonElement;
  }

  function rowButton(id: string): HTMLButtonElement {
    const found = host.querySelector(`[data-row="${id}"]`);
    expect(found).not.toBeNull();
    return found as HTMLButtonElement;
  }

  function barButton(id: string): HTMLButtonElement {
    const found = host.querySelector(`[data-bar="${id}"]`);
    expect(found).not.toBeNull();
    return found as HTMLButtonElement;
  }

  // --- regions --------------------------------------------------------------

  it('when the page renders, the five content regions appear in the spec’s order', () => {
    const markers = [
      '[data-testid="toolbar-status"]',
      '#attribution-summary-heading',
      '#attribution-table-heading',
      '#attribution-chart-heading',
      '#factor-impact-heading',
    ].map((selector) => host.querySelector(selector));

    expect(markers.every((element) => element !== null)).toBe(true);

    const positions = markers.map((element) =>
      Array.prototype.indexOf.call(host.querySelectorAll('*'), element),
    );
    expect(positions).toEqual([...positions].sort((a, b) => a - b));
  });

  it('when the page renders, a skip link jumps past the toolbar to the decomposition', () => {
    const skip = host.querySelector('a.skip-link');
    expect(skip?.getAttribute('href')).toBe('#risk-attribution-content');
    expect(host.querySelector('#risk-attribution-content')).not.toBeNull();
  });

  it('when the page renders, headings start at h2 and skip no level on the way down', () => {
    const levels = Array.from(host.querySelectorAll('h1,h2,h3,h4,h5,h6')).map((heading) =>
      Number(heading.tagName.slice(1)),
    );

    expect(levels.length).toBeGreaterThan(0);
    expect(Math.min(...levels)).toBe(2);
    expect(levels).not.toContain(1);
    const jumps = levels.filter((level, i) => i > 0 && level > levels[i - 1] + 1);
    expect(jumps).toEqual([]);
  });

  it('when the page renders, no control on it is destructive', () => {
    const acting = buttons().filter((b) =>
      /\b(delete|remove|approve|reject|send|kill|reset)\b/i.test(b.textContent ?? ''),
    );
    expect(acting).toEqual([]);
  });

  // --- the wireframe's worked example ---------------------------------------

  it('when the page renders, the summary and the TOTAL row print the same three figures', () => {
    const total = host.querySelector('[data-testid="attribution-total-row"]')!;
    const summary = host.querySelector('app-attribution-summary')!;

    // EC is the TOTAL row's contribution figure, not a second sum of the rows.
    expect(total.textContent).toContain('$4,182,300');
    expect(summary.textContent).toContain('$4,182,300');

    // Σ stand-alone appears in the TOTAL row and again beside the chart.
    expect(total.textContent).toContain('$5,808,800');
    expect(host.querySelector('[data-testid="chart-reference"]')?.textContent).toContain(
      '$5,808,800',
    );

    // DI and the benefit are the ratio of those two and nothing else.
    expect(summary.textContent).toContain('0.72');
    expect(summary.textContent).toContain('+28.0%');
    expect(host.querySelector('[data-testid="chart-reference"]')?.textContent).toContain('+28.0%');
  });

  it('when the page renders, the book holds 26 components and the count says so', () => {
    expect(service.rows()).toHaveLength(26);
    expect(host.querySelector('[data-testid="filter-chip-bar-count"]')?.textContent).toContain(
      '26 components',
    );
  });

  // --- selection is one selection -------------------------------------------

  it('when a table row is opened, the matching chart bar reports the same selection', async () => {
    rowButton('AAPL').click();
    fixture.detectChanges();
    await fixture.whenStable();

    expect(barButton('AAPL').getAttribute('aria-pressed')).toBe('true');
    expect(host.querySelector('#risk-attribution-detail')).not.toBeNull();
  });

  it('when a chart bar is opened, the matching table row reports the same selection', async () => {
    barButton('MSFT').click();
    fixture.detectChanges();
    await fixture.whenStable();

    expect(rowButton('MSFT').getAttribute('aria-expanded')).toBe('true');
    expect(host.querySelector('[data-testid="detail-heading"]')?.textContent).toContain('MSFT');
  });

  it('when a table row is hovered, the matching chart bar lights with it', () => {
    rowButton('AAPL').closest('tr')!.dispatchEvent(new MouseEvent('mouseenter'));
    fixture.detectChanges();

    expect(barButton('AAPL').getAttribute('data-highlighted')).toBe('true');
    expect(barButton('MSFT').getAttribute('data-highlighted')).toBeNull();

    rowButton('AAPL').closest('tr')!.dispatchEvent(new MouseEvent('mouseleave'));
    fixture.detectChanges();
    expect(barButton('AAPL').getAttribute('data-highlighted')).toBeNull();
  });

  it('when a chart bar is hovered, the matching table row lights with it', () => {
    barButton('MSFT').dispatchEvent(new MouseEvent('mouseenter'));
    fixture.detectChanges();

    expect(rowButton('MSFT').closest('tr')?.getAttribute('data-highlighted')).toBe('true');
  });

  it('when a row takes keyboard focus, the link is made without a pointer', () => {
    rowButton('AAPL').focus();
    fixture.detectChanges();

    expect(barButton('AAPL').getAttribute('data-highlighted')).toBe('true');
  });

  // --- focus round trips ----------------------------------------------------

  it('when a row is opened, focus moves into the panel and onto its close control', async () => {
    const row = rowButton('AAPL');
    row.focus();
    row.click();
    fixture.detectChanges();
    await fixture.whenStable();

    // `### Accessibilità`: "l'apertura sposta il focus su ClosePanelButton".
    const active = document.activeElement as HTMLElement | null;
    expect(host.querySelector('#risk-attribution-detail')?.contains(active ?? null)).toBe(true);
    expect(active?.textContent).toContain('Close component detail');
  });

  it('when the panel is closed with Escape, focus returns to the row that opened it', async () => {
    const row = rowButton('AAPL');
    row.focus();
    row.click();
    fixture.detectChanges();
    await fixture.whenStable();

    document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
    fixture.detectChanges();

    expect(host.querySelector('#risk-attribution-detail')).toBeNull();
    expect(document.activeElement).toBe(rowButton('AAPL'));
  });

  it('when the panel is closed with Escape, focus returns to the bar that opened it', async () => {
    const bar = barButton('NVDA');
    bar.focus();
    bar.click();
    fixture.detectChanges();
    await fixture.whenStable();

    document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
    fixture.detectChanges();

    expect(host.querySelector('#risk-attribution-detail')).toBeNull();
    expect(document.activeElement).toBe(barButton('NVDA'));
  });

  it('when the panel is closed with its own control, the rest of the page is left interactive', async () => {
    const row = rowButton('AAPL');
    row.focus();
    row.click();
    fixture.detectChanges();
    await fixture.whenStable();

    buttonLabelled('Close component detail').click();
    fixture.detectChanges();
    await fixture.whenStable();

    // A slide-over inerts what is behind it; closing has to undo that.
    const inert = Array.from(document.body.children).filter((el) => el.hasAttribute('inert'));
    expect(inert).toEqual([]);
    expect(document.activeElement).toBe(rowButton('AAPL'));
  });

  // --- the four states ------------------------------------------------------

  it('while a parameter is being applied, every region shows placeholders and the toolbar stays usable', async () => {
    const pending = service.setMeasure('var');
    fixture.detectChanges();

    for (const region of ['summary', 'table', 'chart', 'factor']) {
      const skeleton = host.querySelector(`[data-testid="${region}-skeleton"]`);
      expect(skeleton).not.toBeNull();
      expect(skeleton?.getAttribute('aria-busy')).toBe('true');
    }
    expect(host.querySelector('table')).toBeNull();

    // The control that was not touched is still operable.
    expect((host.querySelector('#attribution-grouping') as HTMLSelectElement).disabled).toBe(false);

    await pending;
    fixture.detectChanges();
    expect(host.querySelector('table')).not.toBeNull();
  });

  it('when the computation fails, an alert replaces the regions and the toolbar stays editable', async () => {
    await service.recompute(true, 'snapshot');
    fixture.detectChanges();

    const alert = host.querySelector('[role="alert"]');
    expect(alert?.textContent).toContain('Risk contributions could not be computed');
    expect(host.querySelector('table')).toBeNull();
    expect((host.querySelector('#attribution-snapshot') as HTMLSelectElement).disabled).toBe(false);
  });

  it('when the failure is retried, the regions come back and focus leaves the destroyed alert', async () => {
    await service.recompute(true, 'snapshot');
    fixture.detectChanges();

    const retry = buttonLabelled('Retry');
    retry.focus();
    retry.click();
    fixture.detectChanges();

    // The button the click landed on is about to be destroyed, so focus is
    // moved onto the region the result will appear in rather than to <body>.
    expect(document.activeElement).toBe(host.querySelector('#risk-attribution-content'));

    await new Promise((resolve) => setTimeout(resolve, 800));
    fixture.detectChanges();
    expect(host.querySelector('[role="alert"]')).toBeNull();
    expect(host.querySelector('table')).not.toBeNull();
  });

  it('when no portfolio is selected, the empty state explains it and offers a way back', () => {
    service.selectPortfolio(null);
    fixture.detectChanges();

    expect(host.querySelector('table')).toBeNull();
    expect(host.textContent).toContain('No portfolio selected');
    expect(host.textContent).toContain('Pick a portfolio in the scope switcher');
    expect(host.querySelector('#attribution-portfolio')).not.toBeNull();
  });

  it('when the book holds one name, the empty state says attribution is undefined for it', () => {
    service.selectPortfolio(SINGLE_NAME_PORTFOLIO_ID);
    fixture.detectChanges();

    expect(host.querySelector('table')).toBeNull();
    expect(host.textContent).toContain('Attribution needs at least two components');
    expect(host.textContent).toContain('nothing to decompose');
  });

  it('when the empty state’s picker chooses a book, the decomposition comes back', () => {
    service.selectPortfolio(null);
    fixture.detectChanges();

    const picker = host.querySelector('#attribution-portfolio') as HTMLSelectElement;
    picker.value = 'core-multi-asset';
    picker.dispatchEvent(new Event('change'));
    fixture.detectChanges();

    expect(host.querySelector('table')).not.toBeNull();
    expect(host.querySelector('[data-testid="attribution-total-row"]')?.textContent).toContain(
      '$4,182,300',
    );
  });

  // --- exits ----------------------------------------------------------------

  it('when the page renders, it exits to Risk Monitoring and to the guardrails', () => {
    const hrefs = Array.from(host.querySelectorAll('a')).map((a) => a.getAttribute('href'));
    expect(hrefs).toContain('/risk/risk-monitoring');
    expect(hrefs).toContain('/approvals/guardrail-killswitch');
  });
});
