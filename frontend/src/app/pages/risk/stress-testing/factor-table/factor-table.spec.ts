/**
 * The factor table, and the claim its last column makes.
 *
 * An unfixed factor is not blank and not zero: it is held at its conditional
 * expected value given the pinned ones, its field is not editable, and the cell
 * says both of those things in words. Ticking Fix is the only thing that turns
 * the cell into a control, and it is announced, because a field two columns
 * away becoming editable cannot be carried by a border colour.
 */

import { ComponentFixture, TestBed } from '@angular/core/testing';

import { UNFIXED_FACTOR_NOTE } from '../../../../models/stress-testing.model';
import { StressTestingService } from '../../../../services/stress-testing.service';
import { FactorTable } from './factor-table';

function settle(ms = 800): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

describe('FactorTable', () => {
  let fixture: ComponentFixture<FactorTable>;
  let host: HTMLElement;
  let service: StressTestingService;

  beforeEach(async () => {
    await TestBed.configureTestingModule({ imports: [FactorTable] }).compileComponents();

    fixture = TestBed.createComponent(FactorTable);
    host = fixture.nativeElement;
    service = TestBed.inject(StressTestingService);
    document.body.appendChild(host);
    fixture.detectChanges();
  });

  afterEach(() => {
    host.remove();
  });

  function fix(id: string): HTMLInputElement {
    return host.querySelector(`[data-fix="${id}"]`) as HTMLInputElement;
  }

  function valueField(id: string): HTMLInputElement | null {
    return host.querySelector(`[data-value="${id}"]`);
  }

  function conditionalCell(id: string): HTMLElement | null {
    return host.querySelector(`[data-conditional="${id}"]`);
  }

  function byTestId(id: string): HTMLElement | null {
    return host.querySelector(`[data-testid="${id}"]`);
  }

  function evaluateButton(): HTMLButtonElement {
    return byTestId('evaluate-manual') as HTMLButtonElement;
  }

  function tick(id: string, checked: boolean): void {
    fix(id).checked = checked;
    fix(id).dispatchEvent(new Event('change'));
    fixture.detectChanges();
  }

  function type(id: string, value: string): void {
    const input = valueField(id)!;
    input.value = value;
    input.dispatchEvent(new Event('change'));
    fixture.detectChanges();
  }

  // --- the four rows ---------------------------------------------------------

  it('when the table renders, it lists the four systematic factors with their last readings', () => {
    const rows = Array.from(host.querySelectorAll('tbody tr'));
    expect(rows).toHaveLength(4);

    const names = rows.map((row) => row.querySelector('th')?.textContent?.trim().split(' —')[0]);
    expect(names).toEqual(['Equity market', 'Rate 10Y (dom.)', 'Credit spread', 'FX EUR/USD']);

    // A return keeps its sign; a level is a level and does not get one.
    expect(rows[0].textContent).toContain('+0.3%');
    expect(rows[1].textContent).toContain('3.10%');
    expect(rows[2].textContent).toContain('142bp');
    expect(rows[3].textContent).toContain('−0.4%');
  });

  it('when nothing is fixed, every scenario value reads as the conditional expectation and none is editable', () => {
    for (const id of ['equity', 'rate-10y', 'credit-spread', 'fx-eurusd']) {
      expect(valueField(id), id).toBeNull();
      expect(conditionalCell(id)?.textContent, id).toContain('cond. E[·]');
      expect(conditionalCell(id)?.textContent, id).toContain('not editable');
      expect(fix(id).checked, id).toBe(false);
    }
    expect(byTestId('unfixed-note')?.textContent?.trim()).toBe(UNFIXED_FACTOR_NOTE);
  });

  it('when a factor is fixed, its value becomes a control and the change is announced', () => {
    tick('fx-eurusd', true);

    const field = valueField('fx-eurusd');
    expect(field).not.toBeNull();
    expect(field?.getAttribute('aria-label')).toBe('Scenario value for FX EUR/USD, in percent');
    expect(conditionalCell('fx-eurusd')).toBeNull();
    expect(byTestId('fix-announcement')?.textContent).toContain(
      'FX EUR/USD fixed. Its scenario value field is now editable.',
    );
    expect(byTestId('fix-announcement')?.getAttribute('aria-live')).toBe('polite');
  });

  it('when a factor is released, its value goes back to the conditional expectation', () => {
    tick('equity', true);
    type('equity', '-18');
    tick('equity', false);

    expect(valueField('equity')).toBeNull();
    expect(conditionalCell('equity')?.textContent).toContain('cond. E[·]');
    expect(byTestId('fix-announcement')?.textContent).toContain(
      'held at its conditional expected value',
    );
  });

  it('when one factor is pinned, the others move to their conditional expected value', () => {
    tick('equity', true);
    type('equity', '-18');

    // Equity crashes: spreads widen and the domestic yield falls with it.
    expect(conditionalCell('credit-spread')?.textContent).toContain('+');
    expect(conditionalCell('rate-10y')?.textContent).toContain('−');
    expect(conditionalCell('fx-eurusd')?.textContent).toContain('cond. E[·]');
  });

  // --- the evaluate action ---------------------------------------------------

  it('when nothing is pinned, the manual evaluation is inert and says why', () => {
    expect(evaluateButton().disabled).toBe(true);
    expect(host.textContent).toContain('Fix at least one factor and give it a value');
  });

  it('when a factor is pinned but left blank, the manual evaluation stays inert', () => {
    tick('equity', true);

    expect(evaluateButton().disabled).toBe(true);
  });

  it('when a pinned factor has a value, the manual evaluation runs on it', async () => {
    tick('equity', true);
    type('equity', '-18');
    expect(evaluateButton().disabled).toBe(false);

    evaluateButton().focus();
    evaluateButton().click();
    fixture.detectChanges();
    expect(evaluateButton().getAttribute('aria-busy')).toBe('true');
    expect(evaluateButton().getAttribute('aria-disabled')).toBe('true');
    // Not `disabled`: that would drop focus to <body> for the whole run.
    expect(evaluateButton().disabled).toBe(false);
    expect(document.activeElement).toBe(evaluateButton());

    await settle();
    fixture.detectChanges();
    expect(evaluateButton().getAttribute('aria-disabled')).toBeNull();
    expect(service.manualResult()?.maha).toBeCloseTo(5.42, 2);
  });

  it('when a pinned value is cleared, the shock is dropped rather than read as zero', () => {
    tick('equity', true);
    type('equity', '-18');
    type('equity', '');

    expect(service.factors()[0].scenarioValue).toBeNull();
    expect(evaluateButton().disabled).toBe(true);
  });

  // --- feasibility, before the button is pressed ------------------------------

  it('when the pinned factors already sit outside Ell_k, the table warns before the search is run', () => {
    tick('equity', true);
    type('equity', '-18');

    expect(byTestId('fixed-plausibility')?.textContent).toContain('Maha(r_C) = 5.42');
    expect(byTestId('fixed-plausibility')?.textContent).toContain('k = 5.00');
    expect(byTestId('infeasible-warning')?.textContent).toContain('outside Ell_k');
  });

  it('when the radius is widened past the pinned scenario, the warning goes', () => {
    tick('equity', true);
    type('equity', '-18');
    expect(byTestId('infeasible-warning')).not.toBeNull();

    service.setK(6);
    fixture.detectChanges();

    expect(byTestId('infeasible-warning')).toBeNull();
    expect(byTestId('fixed-plausibility')?.textContent).toContain('k = 6.00');
  });

  it('when nothing is pinned, no plausibility line is shown at all', () => {
    expect(byTestId('fixed-plausibility')).toBeNull();
  });
});
