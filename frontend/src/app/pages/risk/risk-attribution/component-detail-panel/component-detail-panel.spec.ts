/**
 * Region 6 — the per-component slide-over.
 *
 * It is the only place the three figures appear side by side, which is the
 * page's argument in miniature: the with-without contribution is below the
 * Euler one, and the Euler one is below the stand-alone risk. The panel proves
 * it prints the row's own numbers by being checked against the same figures the
 * table shows.
 */

import { ComponentFixture, TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';

import { RiskAttributionService } from '../../../../services/risk-attribution.service';
import { ComponentDetailPanel } from './component-detail-panel';

describe('ComponentDetailPanel', () => {
  let fixture: ComponentFixture<ComponentDetailPanel>;
  let host: HTMLElement;
  let service: RiskAttributionService;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [ComponentDetailPanel],
      providers: [provideRouter([])],
    }).compileComponents();
    fixture = TestBed.createComponent(ComponentDetailPanel);
    host = fixture.nativeElement;
    service = TestBed.inject(RiskAttributionService);
    document.body.appendChild(host);
    fixture.detectChanges();
  });

  afterEach(() => host.remove());

  async function open(id: string): Promise<void> {
    service.selectComponent(id);
    fixture.detectChanges();
    await fixture.whenStable();
  }

  function text(testId: string): string {
    return host.querySelector(`[data-testid="${testId}"]`)?.textContent?.trim() ?? '';
  }

  // --- opening --------------------------------------------------------------

  it('when nothing is selected, the panel is not in the document', () => {
    expect(host.querySelector('#risk-attribution-detail')).toBeNull();
  });

  it('when a component is selected, the panel opens as a dialog naming it', async () => {
    await open('AAPL');

    const dialog = host.querySelector('[role="dialog"]')!;
    expect(dialog.getAttribute('aria-modal')).toBe('true');
    expect(dialog.getAttribute('aria-label')).toContain('AAPL');
    expect(text('detail-heading')).toBe('AAPL · Volatility · Euler');
  });

  it('when a component is selected, focus moves onto the close control the spec names', async () => {
    await open('AAPL');

    const active = document.activeElement as HTMLElement | null;
    expect(active?.tagName).toBe('BUTTON');
    expect(active?.textContent).toContain('Close component detail');
  });

  it('when the panel is open, it names the component in full, not only by ticker', async () => {
    await open('AAPL');
    expect(host.textContent).toContain('Apple Inc.');
  });

  // --- the comparison -------------------------------------------------------

  it('when the panel is open, the three contributions are printed side by side', async () => {
    await open('AAPL');

    expect(text('detail-stand-alone')).toBe('$612,000');
    expect(text('detail-marginal')).toBe('$395,194');
    expect(text('detail-euler')).toBe('$421,300');
  });

  it('when the panel is open, the with-without figure is below the Euler one', async () => {
    await open('AAPL');
    const component = service.selectedComponent()!;

    expect(component.marginal).toBeLessThan(component.euler);
    expect(component.euler).toBeLessThan(component.standAlone);
  });

  it('when the panel is open, RORAC is compared against the portfolio in words', async () => {
    await open('AAPL');

    expect(text('detail-rorac')).toContain('14.2%');
    expect(text('detail-rorac')).toContain('9.8%');
    expect(text('detail-rorac')).toContain('above');
  });

  it('when the component earns less than the book, the comparison says below', async () => {
    await open('PG');
    expect(text('detail-rorac')).toContain('below');
  });

  it('when the panel is open, the marginal diversification index is shown', async () => {
    await open('AAPL');
    expect(text('detail-marginal-di')).toBe('0.69');
  });

  it('when the panel is open, the beta to the portfolio is the Euler share', async () => {
    await open('AAPL');
    expect(host.textContent).toContain('0.101');
  });

  // --- the undefined cases --------------------------------------------------

  it('when the contribution is negative, RORAC is a dash with its reason', async () => {
    await open('TLT');

    expect(text('detail-rorac')).toContain('—');
    expect(text('detail-rorac')).toContain('RORAC is undefined');
    expect(text('detail-marginal-di')).toBe('—');
  });

  it('when the component is a hedge, the panel says so with a glyph and the word', async () => {
    await open('TLT');

    expect(text('detail-hedge-note')).toContain('▼');
    expect(text('detail-hedge-note')).toContain('hedge');
    expect(text('detail-hedge-note')).toContain('removing it would raise EC');
  });

  // --- the method's message -------------------------------------------------

  it('when the method is Euler, the panel explains full allocation', async () => {
    await open('AAPL');
    expect(text('detail-method-note')).toContain('Euler');
    expect(text('detail-method-note')).toContain('sum to EC exactly');
  });

  it('when the method is Marginal, the panel’s message changes with it', async () => {
    await service.setMethod('marginal');
    await open('AAPL');

    expect(text('detail-method-note')).toContain('Marginal');
    expect(text('detail-method-note')).toContain('do not satisfy the full allocation property');
    expect(text('detail-heading')).toBe('AAPL · Volatility · Marginal');
  });

  it('when the panel is open, it relates the risk contribution to the expected loss', async () => {
    await open('AAPL');
    expect(text('detail-loss-note')).toContain('risk budgeting is loss budgeting');
  });

  // --- closing --------------------------------------------------------------

  it('when the close control is used, the selection is cleared and the panel goes', async () => {
    await open('AAPL');

    const close = Array.from(host.querySelectorAll('button')).find((b) =>
      b.textContent?.includes('Close component detail'),
    )!;
    close.click();
    fixture.detectChanges();

    expect(service.selectedComponentId()).toBeNull();
    expect(host.querySelector('#risk-attribution-detail')).toBeNull();
  });

  it('when Escape is pressed, the panel closes', async () => {
    await open('AAPL');

    document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
    fixture.detectChanges();

    expect(host.querySelector('#risk-attribution-detail')).toBeNull();
  });

  it('when the panel is open, its only exits are cross-page links', async () => {
    await open('AAPL');

    const hrefs = Array.from(host.querySelectorAll('a')).map((a) => a.getAttribute('href'));
    expect(hrefs).toContain('/risk/risk-monitoring');
    expect(hrefs).toContain('/approvals/guardrail-killswitch');
  });
});
