import { ComponentFixture, TestBed } from '@angular/core/testing';

import {
  DETERMINISTIC_CALCULATION_NOTE,
  RUNNING_TOOL_LABEL,
} from '../../../../models/risk-verdict.model';
import { RiskAgentService } from '../../../../services/risk-agent.service';
import { CalculationTrace } from './calculation-trace';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

async function setup(): Promise<ComponentFixture<CalculationTrace>> {
  await TestBed.configureTestingModule({ imports: [CalculationTrace] }).compileComponents();
  const fixture = TestBed.createComponent(CalculationTrace);
  fixture.detectChanges();
  return fixture;
}

function host(fixture: ComponentFixture<unknown>): HTMLElement {
  return fixture.nativeElement as HTMLElement;
}

function service(): RiskAgentService {
  return TestBed.inject(RiskAgentService);
}

// ===========================================================================
// Criterion — the calculation is the orchestrator's, not the model's
// ===========================================================================

describe('CalculationTrace — the trace', () => {
  it('when the card renders, it states that the tool is invoked automatically', async () => {
    const fixture = await setup();
    expect(host(fixture).textContent).toContain(DETERMINISTIC_CALCULATION_NOTE);
  });

  it('when a run is on screen, the card reports when portopt ran and for how long', async () => {
    const fixture = await setup();
    const stamp = host(fixture).querySelector('[data-testid="calculation-stamp"]')!;

    expect(stamp.textContent).toContain('09:14:02 UTC');
    expect(stamp.textContent).toContain('duration 0.42s');
  });

  it('when an older run is selected, the trace follows that run', async () => {
    const fixture = await setup();
    service().selectRun('1246');
    fixture.detectChanges();

    const stamp = host(fixture).querySelector('[data-testid="calculation-stamp"]')!;
    expect(stamp.textContent).toContain('17:39:59 UTC');
    expect(stamp.textContent).toContain('duration 0.39s');
  });

  it('when a display filter changes, the trace of the deterministic calculation does not', async () => {
    const fixture = await setup();
    const before = host(fixture).querySelector('[data-testid="calculation-stamp"]')!.textContent;

    service().method.set('historical');
    service().confidence.set(99);
    fixture.detectChanges();

    expect(host(fixture).querySelector('[data-testid="calculation-stamp"]')!.textContent).toBe(
      before,
    );
  });
});

// ===========================================================================
// Criterion — progress carries a text label, not only an animation
// ===========================================================================

describe('CalculationTrace — while it runs', () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('when the assessment is running, the card names the tool in text and marks itself busy', async () => {
    const fixture = await setup();
    const pending = service().recompute();
    fixture.detectChanges();

    const running = host(fixture).querySelector('[data-testid="calculation-running"]')!;
    expect(running.textContent).toContain(RUNNING_TOOL_LABEL);
    expect(host(fixture).querySelector('[aria-busy="true"]')).toBeTruthy();
    expect(host(fixture).querySelector('[data-testid="calculation-stamp"]')).toBeNull();

    await vi.advanceTimersByTimeAsync(5_000);
    await pending;
    fixture.detectChanges();

    expect(host(fixture).querySelector('[data-testid="calculation-running"]')).toBeNull();
    expect(host(fixture).querySelector('[data-testid="calculation-stamp"]')).toBeTruthy();
  });
});
