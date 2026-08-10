import { ComponentFixture, TestBed } from '@angular/core/testing';

import { FILTER_NOTE } from '../../../../models/risk-verdict.model';
import { RiskAgentService } from '../../../../services/risk-agent.service';
import { MeasureFilters } from './measure-filters';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

async function setup(): Promise<ComponentFixture<MeasureFilters>> {
  await TestBed.configureTestingModule({ imports: [MeasureFilters] }).compileComponents();
  const fixture = TestBed.createComponent(MeasureFilters);
  fixture.detectChanges();
  return fixture;
}

function host(fixture: ComponentFixture<unknown>): HTMLElement {
  return fixture.nativeElement as HTMLElement;
}

function group(fixture: ComponentFixture<unknown>, label: string): HTMLElement {
  const found = host(fixture).querySelector(`[role="radiogroup"][aria-label="${label}"]`);
  if (!found) throw new Error(`no radiogroup named ${label}`);
  return found as HTMLElement;
}

function radios(fixture: ComponentFixture<unknown>, label: string): HTMLButtonElement[] {
  return Array.from(group(fixture, label).querySelectorAll('[role="radio"]'));
}

function checked(fixture: ComponentFixture<unknown>, label: string): string {
  const on = radios(fixture, label).find((r) => r.getAttribute('aria-checked') === 'true');
  return (on?.textContent ?? '').trim();
}

function service(): RiskAgentService {
  return TestBed.inject(RiskAgentService);
}

// ===========================================================================
// Criterion — two radiogroups, each with its selection announced
// ===========================================================================

describe('MeasureFilters — the controls', () => {
  it('when the bar renders, confidence and method are both radiogroups', async () => {
    const fixture = await setup();

    expect(radios(fixture, 'Confidence').map((r) => r.textContent?.trim())).toEqual(['95%', '99%']);
    expect(radios(fixture, 'Method').map((r) => r.textContent?.trim())).toEqual([
      'RiskMetrics',
      'Historical',
    ]);
  });

  it('when the bar renders, the defaults are the recommended level and the parametric method', async () => {
    const fixture = await setup();

    expect(checked(fixture, 'Confidence')).toBe('95%');
    expect(checked(fixture, 'Method')).toBe('RiskMetrics');
  });

  it('when a chip is chosen, the selection is carried by aria-checked, not by colour', async () => {
    const fixture = await setup();
    radios(fixture, 'Confidence')[1].click();
    fixture.detectChanges();

    expect(checked(fixture, 'Confidence')).toBe('99%');
    expect(radios(fixture, 'Confidence')[0].getAttribute('aria-checked')).toBe('false');
  });
});

// ===========================================================================
// Criterion — the chips filter; they never recompute
// ===========================================================================

describe('MeasureFilters — filtering, not recomputing', () => {
  it('when the confidence level changes, the service level follows and nothing is recomputed', async () => {
    const fixture = await setup();
    const spy = vi.spyOn(service(), 'recompute');

    radios(fixture, 'Confidence')[1].click();
    fixture.detectChanges();

    expect(service().confidence()).toBe(99);
    expect(spy).not.toHaveBeenCalled();
  });

  it('when the method changes, the service method follows and nothing is recomputed', async () => {
    const fixture = await setup();
    const spy = vi.spyOn(service(), 'recompute');

    radios(fixture, 'Method')[1].click();
    fixture.detectChanges();

    expect(service().method()).toBe('historical');
    expect(spy).not.toHaveBeenCalled();
  });

  it('when a chip changes, the tool call log of the run is untouched', async () => {
    const fixture = await setup();
    const before = service().toolCalls();

    radios(fixture, 'Method')[1].click();
    radios(fixture, 'Confidence')[1].click();
    fixture.detectChanges();

    expect(service().toolCalls()).toBe(before);
  });

  it('when the bar renders, it says in words that the chips do not recompute', async () => {
    const fixture = await setup();
    expect(host(fixture).querySelector('[data-testid="filter-note"]')!.textContent).toContain(
      FILTER_NOTE,
    );
  });
});

// ===========================================================================
// Criterion — the definitions behind each choice are readable, not hover-only
// ===========================================================================

describe('MeasureFilters — definitions', () => {
  it('when the method changes, the definition on screen changes with it', async () => {
    const fixture = await setup();
    expect(host(fixture).textContent).toContain('Parametric');

    radios(fixture, 'Method')[1].click();
    fixture.detectChanges();

    expect(host(fixture).textContent).toContain('Empirical');
    expect(host(fixture).textContent).not.toContain('Parametric');
  });

  it('when the confidence level changes, its definition changes with it', async () => {
    const fixture = await setup();
    expect(host(fixture).textContent).toContain('one day in twenty');

    radios(fixture, 'Confidence')[1].click();
    fixture.detectChanges();

    expect(host(fixture).textContent).toContain('one day in a hundred');
  });

  it('when the combination changes, the bar announces it politely', async () => {
    const fixture = await setup();
    const region = host(fixture).querySelector('[aria-live="polite"]')!;
    expect(region.textContent).toContain('95%');

    radios(fixture, 'Confidence')[1].click();
    fixture.detectChanges();

    expect(region.textContent).toContain('99%');
  });
});
