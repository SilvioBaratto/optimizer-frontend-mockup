import { ComponentFixture, TestBed } from '@angular/core/testing';

import {
  NOT_APPLICABLE,
  RISK_MEASURE_ORDER,
  TCE_COINCIDENCE_NOTE,
  WCE_UNAVAILABLE_NOTE,
  type RiskMeasureId,
} from '../../../../models/risk-verdict.model';
import { RiskAgentService } from '../../../../services/risk-agent.service';
import { RiskMeasures } from './risk-measures';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

async function setup(): Promise<ComponentFixture<RiskMeasures>> {
  await TestBed.configureTestingModule({ imports: [RiskMeasures] }).compileComponents();
  const fixture = TestBed.createComponent(RiskMeasures);
  fixture.detectChanges();
  return fixture;
}

function host(fixture: ComponentFixture<unknown>): HTMLElement {
  return fixture.nativeElement as HTMLElement;
}

function valueOf(fixture: ComponentFixture<unknown>, id: RiskMeasureId): string {
  const cell = host(fixture).querySelector(`[data-measure="${id}"]`);
  if (!cell) throw new Error(`no ${id} card on screen`);
  return (cell.textContent ?? '').trim();
}

/** The `role="group"` wrapper of one measure card — what a reader enters. */
function groupOf(fixture: ComponentFixture<unknown>, id: RiskMeasureId): HTMLElement {
  const cell = host(fixture).querySelector(`[data-measure="${id}"]`);
  const group = cell?.closest('[role="group"]');
  if (!group) throw new Error(`no group around the ${id} card`);
  return group as HTMLElement;
}

function service(): RiskAgentService {
  return TestBed.inject(RiskAgentService);
}

/** The model's own wireframe order — asserted against, never restated here. */
const MEASURES: readonly RiskMeasureId[] = RISK_MEASURE_ORDER;

// ===========================================================================
// Criterion — the five measures, in the wireframe's order
// ===========================================================================

describe('RiskMeasures — the grid', () => {
  it('when the grid renders, all five measures are cards in wireframe order', async () => {
    const fixture = await setup();
    const rendered = Array.from(host(fixture).querySelectorAll('[data-measure]')).map((el) =>
      el.getAttribute('data-measure'),
    );
    expect(rendered).toEqual([...MEASURES]);
  });

  it('when the grid renders, the section label states the combination on screen', async () => {
    const fixture = await setup();
    expect(host(fixture).querySelector('h2')!.textContent).toContain('95%');
    expect(host(fixture).querySelector('h2')!.textContent).toContain('RiskMetrics');
  });

  it('when the confidence level changes, the label and the VaR both follow it', async () => {
    const fixture = await setup();
    const before = valueOf(fixture, 'var');

    service().confidence.set(99);
    fixture.detectChanges();

    expect(host(fixture).querySelector('h2')!.textContent).toContain('99%');
    expect(valueOf(fixture, 'var')).not.toBe(before);
  });
});

// ===========================================================================
// Criterion — TCE ⇄ ES/CVaR, and the note that describes both cards
// ===========================================================================

describe('RiskMeasures — the TCE coincidence', () => {
  it('when the method is RiskMetrics, the TCE card shows the ES/CVaR value', async () => {
    const fixture = await setup();
    expect(valueOf(fixture, 'tce')).toBe(valueOf(fixture, 'es'));
  });

  it('when the method is RiskMetrics, the coincidence note is rendered once, on the TCE card', async () => {
    const fixture = await setup();
    const notes = Array.from(host(fixture).querySelectorAll('p')).filter(
      (p) => (p.textContent ?? '').trim() === TCE_COINCIDENCE_NOTE,
    );
    expect(notes).toHaveLength(1);
    expect(notes[0].closest('[role="group"]')).toBe(groupOf(fixture, 'tce'));
  });

  it('when the method is RiskMetrics, the coincidence note describes BOTH the ES and the TCE card', async () => {
    const fixture = await setup();

    const describedByEs = groupOf(fixture, 'es').getAttribute('aria-describedby');
    const describedByTce = groupOf(fixture, 'tce').getAttribute('aria-describedby');
    expect(describedByEs).toBeTruthy();
    expect(describedByTce).toBe(describedByEs);

    // The id has to resolve, or the description is announced as nothing at all.
    const target = host(fixture).querySelector(`#${describedByEs}`);
    expect(target).toBeTruthy();
    expect((target!.textContent ?? '').trim()).toBe(TCE_COINCIDENCE_NOTE);
  });

  it('when the method is Historical, TCE and ES/CVaR are separate numbers', async () => {
    const fixture = await setup();
    service().method.set('historical');
    fixture.detectChanges();

    expect(valueOf(fixture, 'tce')).not.toBe(valueOf(fixture, 'es'));
  });

  it('when the method is Historical, the coincidence note and its description are gone from the DOM', async () => {
    const fixture = await setup();
    service().method.set('historical');
    fixture.detectChanges();

    expect(host(fixture).textContent).not.toContain(TCE_COINCIDENCE_NOTE);
    expect(groupOf(fixture, 'es').getAttribute('aria-describedby')).toBeNull();
    expect(groupOf(fixture, 'tce').getAttribute('aria-describedby')).toBeNull();
  });

  it('when the method goes back to RiskMetrics, the description is re-attached to both cards', async () => {
    const fixture = await setup();
    service().method.set('historical');
    fixture.detectChanges();
    service().method.set('riskmetrics');
    fixture.detectChanges();

    expect(groupOf(fixture, 'es').getAttribute('aria-describedby')).toBeTruthy();
    expect(groupOf(fixture, 'tce').getAttribute('aria-describedby')).toBe(
      groupOf(fixture, 'es').getAttribute('aria-describedby'),
    );
  });

  it('when the grid renders, the footnote explains what the other method would change', async () => {
    const fixture = await setup();
    const note = host(fixture).querySelector('[data-testid="method-note"]')!;
    expect(note.textContent).toContain('Historical');
  });
});

// ===========================================================================
// Criterion — WCE is not applicable, and says why
// ===========================================================================

describe('RiskMeasures — WCE', () => {
  it('when the grid renders, WCE shows a dash rather than a blank cell', async () => {
    const fixture = await setup();
    expect(valueOf(fixture, 'wce')).toBe(NOT_APPLICABLE);
  });

  it('when the grid renders under any combination, WCE explains why it has no value', async () => {
    const fixture = await setup();

    for (const method of ['riskmetrics', 'historical'] as const) {
      for (const confidence of [95, 99] as const) {
        service().method.set(method);
        service().confidence.set(confidence);
        fixture.detectChanges();

        expect(valueOf(fixture, 'wce')).toBe(NOT_APPLICABLE);
        expect(groupOf(fixture, 'wce').textContent).toContain(WCE_UNAVAILABLE_NOTE);
      }
    }
  });
});

// ===========================================================================
// Criterion — every card is named for assistive tech
// ===========================================================================

describe('RiskMeasures — naming', () => {
  it('when the grid renders, each measure group is labelled by its own heading', async () => {
    const fixture = await setup();

    for (const id of MEASURES) {
      const group = groupOf(fixture, id);
      const labelId = group.getAttribute('aria-labelledby');
      expect(labelId).toBeTruthy();
      const heading = host(fixture).querySelector(`#${labelId}`);
      expect(heading).toBeTruthy();
      expect(heading!.tagName.toLowerCase()).toBe('h3');
    }
  });
});

// ===========================================================================
// Criterion — loading replaces values with skeletons of the same shape
// ===========================================================================

describe('RiskMeasures — loading', () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('when an assessment is running, every card becomes a skeleton and the grid is busy', async () => {
    const fixture = await setup();
    const pending = service().recompute();
    fixture.detectChanges();

    expect(host(fixture).querySelectorAll('[data-measure]')).toHaveLength(0);
    expect(host(fixture).querySelectorAll('app-skeleton-block').length).toBeGreaterThan(0);
    expect(host(fixture).querySelector('app-section-card-grid')!.getAttribute('aria-busy')).toBe(
      'true',
    );

    await vi.advanceTimersByTimeAsync(5_000);
    await pending;
    fixture.detectChanges();

    expect(host(fixture).querySelectorAll('[data-measure]')).toHaveLength(5);
    expect(host(fixture).querySelectorAll('app-skeleton-block')).toHaveLength(0);
  });

  it('when an assessment is running, the five headings stay so the grid does not reflow', async () => {
    const fixture = await setup();
    const before = Array.from(host(fixture).querySelectorAll('h3')).map((h) => h.textContent);

    const pending = service().recompute();
    fixture.detectChanges();

    expect(Array.from(host(fixture).querySelectorAll('h3')).map((h) => h.textContent)).toEqual(
      before,
    );

    await vi.advanceTimersByTimeAsync(5_000);
    await pending;
  });
});
