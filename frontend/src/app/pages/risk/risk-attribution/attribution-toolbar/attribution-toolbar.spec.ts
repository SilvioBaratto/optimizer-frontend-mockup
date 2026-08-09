/**
 * Region 1 — the toolbar.
 *
 * The rule under test is the one the spec states twice: a control that does not
 * apply to the selected measure stays visible, stays announced, and carries its
 * reason through `aria-describedby`. Hiding it would reflow the toolbar; leaving
 * it silently inert would make the page feel broken.
 *
 * The other half is the split between the six parameters that recompute and the
 * two that only reformat. The `$ / %` switch and the search field are proved not
 * to recompute by spying on the only method that can.
 */

import { ComponentFixture, TestBed } from '@angular/core/testing';

import {
  CONFIDENCE_DISABLED_REASON,
  ESTIMATION_APPROACH_DISABLED_REASON,
} from '../../../../models/risk-attribution.model';
import { RiskAttributionService } from '../../../../services/risk-attribution.service';
import { AttributionToolbar } from './attribution-toolbar';

describe('AttributionToolbar', () => {
  let fixture: ComponentFixture<AttributionToolbar>;
  let host: HTMLElement;
  let service: RiskAttributionService;

  beforeEach(async () => {
    await TestBed.configureTestingModule({ imports: [AttributionToolbar] }).compileComponents();
    fixture = TestBed.createComponent(AttributionToolbar);
    host = fixture.nativeElement;
    service = TestBed.inject(RiskAttributionService);
    // In the document, so a test can assert where the focus actually went.
    document.body.appendChild(host);
    fixture.detectChanges();
  });

  afterEach(() => host.remove());

  function group(label: string): HTMLElement {
    const found = host.querySelector(`[role="radiogroup"][aria-label="${label}"]`);
    expect(found).not.toBeNull();
    return found as HTMLElement;
  }

  function radios(label: string): HTMLButtonElement[] {
    return Array.from(group(label).querySelectorAll('[role="radio"]'));
  }

  function checked(label: string): string {
    const on = radios(label).find((r) => r.getAttribute('aria-checked') === 'true');
    return (on?.textContent ?? '').trim();
  }

  /** The text `aria-describedby` on the first option actually resolves to. */
  function describedText(label: string): string {
    const id = radios(label)[0].getAttribute('aria-describedby');
    if (!id) return '';
    return host.querySelector(`#${id}`)?.textContent?.trim() ?? '';
  }

  function select(id: string): HTMLSelectElement {
    return host.querySelector(`#${id}`) as HTMLSelectElement;
  }

  // --- the eight controls ---------------------------------------------------

  it('when the toolbar renders, all eight controls of the wireframe are present', () => {
    expect(radios('Risk measure').map((r) => r.textContent?.trim())).toEqual([
      'Volatility',
      'VaR',
      'ES',
    ]);
    expect(radios('Confidence').map((r) => r.textContent?.trim())).toEqual(['90%', '95%', '99%']);
    expect(radios('Method').map((r) => r.textContent?.trim())).toEqual(['Euler', 'Marginal']);
    expect(radios('Estimation approach').map((r) => r.textContent?.trim())).toEqual([
      'Empirical',
      'Parametric',
    ]);
    expect(radios('Show risk figures in').map((r) => r.textContent?.trim())).toEqual(['$', '%']);
    expect(select('attribution-grouping')).not.toBeNull();
    expect(select('attribution-snapshot')).not.toBeNull();
    expect(host.querySelector('#attribution-search')).not.toBeNull();
  });

  it('when the toolbar renders, it opens on the defaults the spec names', () => {
    expect(checked('Risk measure')).toBe('Volatility');
    expect(checked('Confidence')).toBe('95%');
    expect(checked('Method')).toBe('Euler');
    expect(checked('Estimation approach')).toBe('Empirical');
    expect(checked('Show risk figures in')).toBe('$');
    expect(select('attribution-grouping').value).toBe('asset');
    expect(select('attribution-snapshot').value).toBe('2026-07-31');
  });

  // --- controls that do not apply to the measure -----------------------------

  it('when the measure is volatility, confidence stays on screen but is disabled with its reason', () => {
    const options = radios('Confidence');
    expect(options).toHaveLength(3);
    for (const option of options) {
      expect(option.getAttribute('aria-disabled')).toBe('true');
    }
    expect(describedText('Confidence')).toBe(CONFIDENCE_DISABLED_REASON);
  });

  it('when the measure is volatility, the estimation approach is disabled with its own reason', () => {
    for (const option of radios('Estimation approach')) {
      expect(option.getAttribute('aria-disabled')).toBe('true');
    }
    expect(describedText('Estimation approach')).toBe(ESTIMATION_APPROACH_DISABLED_REASON);
  });

  it('when a disabled option is activated, nothing changes — the control is inert, not hidden', () => {
    radios('Confidence')[0].click();
    fixture.detectChanges();

    expect(service.confidence()).toBe(95);
    expect(checked('Confidence')).toBe('95%');
  });

  it('when the measure becomes VaR, both dependent controls come back', async () => {
    await service.setMeasure('var');
    fixture.detectChanges();

    expect(radios('Confidence')[0].getAttribute('aria-disabled')).toBeNull();
    expect(radios('Estimation approach')[0].getAttribute('aria-disabled')).toBeNull();
  });

  it('when the measure becomes ES, confidence applies but the estimation approach does not', async () => {
    await service.setMeasure('es');
    fixture.detectChanges();

    expect(radios('Confidence')[0].getAttribute('aria-disabled')).toBeNull();
    expect(radios('Estimation approach')[0].getAttribute('aria-disabled')).toBe('true');
    expect(describedText('Estimation approach')).toBe(ESTIMATION_APPROACH_DISABLED_REASON);
  });

  // --- the parameters that recompute ----------------------------------------

  it('when the confidence level is chosen under VaR, the decomposition is recomputed', async () => {
    await service.setMeasure('var');
    fixture.detectChanges();

    const before = service.economicCapital();
    radios('Confidence')[2].click();
    fixture.detectChanges();
    await new Promise((resolve) => setTimeout(resolve, 800));

    expect(service.confidence()).toBe(99);
    expect(service.economicCapital()).toBeGreaterThan(before);
  });

  it('when the grouping is changed, the service is re-pointed at the other book', async () => {
    const grouping = select('attribution-grouping');
    grouping.value = 'factor';
    grouping.dispatchEvent(new Event('change'));
    await new Promise((resolve) => setTimeout(resolve, 800));

    expect(service.grouping()).toBe('factor');
    expect(service.rows().map((row) => row.name)).toContain('Equity beta');
  });

  it('when the snapshot is changed, the as-of date follows it', async () => {
    const snapshot = select('attribution-snapshot');
    snapshot.value = '2026-06-30';
    snapshot.dispatchEvent(new Event('change'));
    await new Promise((resolve) => setTimeout(resolve, 800));

    expect(service.snapshot().at).toBe('2026-06-30');
  });

  // --- the parameters that only reformat ------------------------------------

  it('when the $/% switch is used, nothing is recomputed', () => {
    const spy = vi.spyOn(service, 'recompute');

    radios('Show risk figures in')[1].click();
    fixture.detectChanges();

    expect(service.displayUnit()).toBe('percent');
    expect(spy).not.toHaveBeenCalled();
  });

  it('when a search term is typed, nothing is recomputed', () => {
    const spy = vi.spyOn(service, 'recompute');
    const input = host.querySelector('#attribution-search') as HTMLInputElement;

    input.value = 'gold';
    input.dispatchEvent(new Event('input'));
    fixture.detectChanges();

    expect(service.visibleRows().map((row) => row.name)).toEqual(['GLD']);
    expect(spy).not.toHaveBeenCalled();
  });

  // --- the inline spinner ---------------------------------------------------

  it('while a parameter is being applied, only that control is inert and the rest stay usable', async () => {
    const pending = service.setMeasure('var');
    fixture.detectChanges();

    // The control that was touched.
    for (const option of radios('Risk measure')) {
      expect(option.getAttribute('aria-disabled')).toBe('true');
    }
    expect(describedText('Risk measure')).toContain('Recomputing the decomposition');

    // Everything else stays interactive, which is what the spec asks for.
    expect(radios('Method')[0].getAttribute('aria-disabled')).toBeNull();
    expect(select('attribution-grouping').disabled).toBe(false);
    expect(select('attribution-snapshot').disabled).toBe(false);

    await pending;
    fixture.detectChanges();
    expect(radios('Risk measure')[0].getAttribute('aria-disabled')).toBeNull();
  });

  it('while a parameter is being applied, the busy marker sits on that control alone', async () => {
    const pending = service.setMeasure('var');
    fixture.detectChanges();

    expect(host.querySelector('[data-testid="pending-measure"]')).not.toBeNull();
    expect(host.querySelector('[data-testid="pending-method"]')).toBeNull();
    expect(host.querySelector('[data-testid="pending-grouping"]')).toBeNull();

    await pending;
    fixture.detectChanges();
    expect(host.querySelector('[data-testid="pending-measure"]')).toBeNull();
  });

  it('while its own recompute runs, the grouping select keeps focus instead of losing it', async () => {
    const grouping = select('attribution-grouping');
    grouping.focus();
    grouping.value = 'factor';
    grouping.dispatchEvent(new Event('change'));
    fixture.detectChanges();

    // `disabled` would have taken the element out of the tab order under the
    // reader's own hands and dropped focus onto <body>.
    expect(grouping.disabled).toBe(false);
    expect(grouping.getAttribute('aria-disabled')).toBe('true');
    expect(document.activeElement).toBe(grouping);

    await new Promise((resolve) => setTimeout(resolve, 800));
    fixture.detectChanges();
    expect(grouping.getAttribute('aria-disabled')).toBeNull();
  });

  it('when the grouping is changed again mid-recompute, the refused change is put back', async () => {
    const grouping = select('attribution-grouping');
    grouping.value = 'factor';
    grouping.dispatchEvent(new Event('change'));
    fixture.detectChanges();

    grouping.value = 'sub-portfolio';
    grouping.dispatchEvent(new Event('change'));
    fixture.detectChanges();

    // The control is inert until its own recompute lands, so the second change
    // is refused and the value the page is actually computing is put back.
    expect(grouping.value).toBe('factor');
    await new Promise((resolve) => setTimeout(resolve, 800));
    expect(service.grouping()).toBe('factor');
  });

  it('while a parameter is being applied, a live region names the control being applied', async () => {
    const pending = service.setMeasure('var');
    fixture.detectChanges();

    const status = host.querySelector('[data-testid="toolbar-status"]')!;
    expect(status.getAttribute('role')).toBe('status');
    expect(status.textContent).toContain('risk measure');

    await pending;
    fixture.detectChanges();
    expect(host.querySelector('[data-testid="toolbar-pending"]')).toBeNull();
  });

  // --- export ---------------------------------------------------------------

  it('when the table is exported, the confirmation names the parameters it was taken under', () => {
    const button = Array.from(host.querySelectorAll('button')).find(
      (b) => b.textContent?.trim() === 'Export',
    )!;
    button.click();
    fixture.detectChanges();

    const notice = host.querySelector('[data-testid="export-notice"]')!;
    expect(notice.textContent).toContain('26 components');
    expect(notice.textContent).toContain('Volatility · Euler');
    expect(notice.textContent).toContain('2026-07-31');
  });
});
