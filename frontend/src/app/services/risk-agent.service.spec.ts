import { TestBed } from '@angular/core/testing';

import {
  CONFIDENCE_LEVELS,
  MACRO_STALE_NOTE,
  TCE_COINCIDENCE_NOTE,
  VAR_METHODS,
  WCE_UNAVAILABLE_NOTE,
  type ConfidenceLevel,
  type FundStateInput,
  type RiskMeasure,
  type RiskMeasureId,
} from '../models/risk-verdict.model';
import { RiskAgentService } from './risk-agent.service';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function setup(): RiskAgentService {
  TestBed.configureTestingModule({});
  return TestBed.inject(RiskAgentService);
}

function measure(service: RiskAgentService, id: RiskMeasureId): RiskMeasure {
  const found = service.measures().find((m) => m.id === id);
  if (!found) throw new Error(`no ${id} measure on screen`);
  return found;
}

function value(service: RiskAgentService, id: RiskMeasureId): number | null {
  return measure(service, id).value;
}

/** Runs every pending timer the service scheduled, then lets the promise settle. */
async function settle(): Promise<void> {
  await vi.advanceTimersByTimeAsync(5_000);
}

const ALLOCATION_AT_0912: FundStateInput = {
  field: 'allocation',
  writtenBy: 'Allocation Agent',
  at: '2026-08-01T09:12:00Z',
  summary: '8 positions',
  positionCount: 8,
  route: '/fund/allocation-agent',
  linkLabel: 'Open in Allocation Agent',
};

function macroAt(at: string): FundStateInput {
  return {
    field: 'macro_view',
    writtenBy: 'Macro & Regimes Agent',
    at,
    summary: 'Bull 62% · six asset-class views',
    positionCount: null,
    route: '/fund/macro-agent',
    linkLabel: 'Open in Macro & Regimes',
  };
}

beforeEach(() => {
  vi.useFakeTimers();
});

afterEach(() => {
  vi.useRealTimers();
});

// ===========================================================================
// Criterion — TCE under a continuous distribution
// ===========================================================================

describe('RiskAgentService — TCE and ES/CVaR', () => {
  it('when the method is RiskMetrics, TCE equals ES/CVaR exactly', () => {
    const service = setup();
    service.method.set('riskmetrics');

    for (const confidence of CONFIDENCE_LEVELS) {
      service.confidence.set(confidence);
      expect(value(service, 'tce')).toBe(value(service, 'es'));
    }
  });

  it('when the method is RiskMetrics, the TCE card carries the coincidence annotation', () => {
    const service = setup();
    service.method.set('riskmetrics');

    expect(measure(service, 'tce').annotation).toBe(TCE_COINCIDENCE_NOTE);
    expect(service.measureSet()?.tceEqualsEs).toBe(true);
  });

  it('when the method is Historical, TCE differs from ES/CVaR', () => {
    const service = setup();
    service.method.set('historical');

    for (const confidence of CONFIDENCE_LEVELS) {
      service.confidence.set(confidence);
      expect(value(service, 'tce')).not.toBe(value(service, 'es'));
    }
  });

  it('when the method is Historical, the coincidence annotation is dropped', () => {
    const service = setup();
    service.method.set('historical');

    expect(measure(service, 'tce').annotation).toBeNull();
    expect(service.measureSet()?.tceEqualsEs).toBe(false);
  });
});

// ===========================================================================
// Criterion — WCE is never computable
// ===========================================================================

describe('RiskAgentService — WCE', () => {
  it('when any confidence and method are selected, WCE has no value', () => {
    const service = setup();

    for (const method of VAR_METHODS) {
      for (const confidence of CONFIDENCE_LEVELS) {
        service.method.set(method);
        service.confidence.set(confidence);
        expect(value(service, 'wce')).toBeNull();
      }
    }
  });

  it('when WCE is shown, it explains that it needs the full probability space', () => {
    const service = setup();

    expect(measure(service, 'wce').annotation).toBe(WCE_UNAVAILABLE_NOTE);
    expect(measure(service, 'wce').horizon).toBeNull();
  });
});

// ===========================================================================
// Criterion — the measures are ordered as the theory requires
// ===========================================================================

describe('RiskAgentService — measure ordering', () => {
  it('when any combination is selected, ES ≤ TCE ≤ VaR ≤ 0', () => {
    const service = setup();

    for (const method of VAR_METHODS) {
      for (const confidence of CONFIDENCE_LEVELS) {
        service.method.set(method);
        service.confidence.set(confidence);

        const varValue = value(service, 'var')!;
        const es = value(service, 'es')!;
        const tce = value(service, 'tce')!;

        expect(varValue).toBeLessThanOrEqual(0);
        expect(tce).toBeLessThanOrEqual(varValue);
        expect(es).toBeLessThanOrEqual(tce);
      }
    }
  });

  it('when the confidence level moves from 95% to 99%, every measure gets more severe', () => {
    const service = setup();

    for (const method of VAR_METHODS) {
      service.method.set(method);
      service.confidence.set(95 as ConfidenceLevel);
      const at95 = { var: value(service, 'var')!, es: value(service, 'es')! };
      service.confidence.set(99 as ConfidenceLevel);

      expect(value(service, 'var')!).toBeLessThan(at95.var);
      expect(value(service, 'es')!).toBeLessThan(at95.es);
    }
  });
});

// ===========================================================================
// Criterion — the chips filter, they never recompute
// ===========================================================================

describe('RiskAgentService — display filters', () => {
  it('when the confidence level changes, the page stays ready and never loads', async () => {
    const service = setup();
    const recompute = vi.spyOn(service, 'recompute');
    const before = value(service, 'var');

    service.confidence.set(99);

    expect(service.state()).toBe('ready');
    expect(value(service, 'var')).not.toBe(before);

    await settle();

    expect(service.state()).toBe('ready');
    expect(recompute).not.toHaveBeenCalled();
  });

  it('when the VaR method changes, the page stays ready and never loads', async () => {
    const service = setup();
    const recompute = vi.spyOn(service, 'recompute');
    const before = value(service, 'var');

    service.method.set('historical');

    expect(service.state()).toBe('ready');
    expect(value(service, 'var')).not.toBe(before);

    await settle();

    expect(service.state()).toBe('ready');
    expect(recompute).not.toHaveBeenCalled();
  });

  it('when a filter changes, the tool call log is untouched', async () => {
    const service = setup();
    const before = service.toolCalls();

    service.method.set('historical');
    service.confidence.set(99);
    await settle();

    expect(service.toolCalls()).toEqual(before);
  });
});

// ===========================================================================
// Criterion — the prerequisite from the shared state
// ===========================================================================

describe('RiskAgentService — allocation prerequisite', () => {
  it('when state.allocation is missing, the assessment cannot be run', () => {
    const service = setup();

    service.readFundState(null, macroAt('2026-08-01T08:55:00Z'));

    expect(service.canRun()).toBe(false);
    expect(service.state()).toBe('empty');
  });

  it('when state.allocation is present, the assessment can be run', () => {
    const service = setup();

    expect(service.allocationInput()).not.toBeNull();
    expect(service.canRun()).toBe(true);
  });
});

// ===========================================================================
// Criterion — freshness of the macro input
// ===========================================================================

describe('RiskAgentService — macro freshness', () => {
  it('when the macro view predates the allocation, the macro input is flagged stale', () => {
    const service = setup();

    service.readFundState(ALLOCATION_AT_0912, macroAt('2026-08-01T08:55:00Z'));

    expect(service.macroInput()?.stale).toBe(true);
    expect(service.macroInput()?.staleNote).toBe(MACRO_STALE_NOTE);
    expect(service.macroStale()).toBe(true);
  });

  it('when the macro view is newer than the allocation, it is not flagged', () => {
    const service = setup();

    service.readFundState(ALLOCATION_AT_0912, macroAt('2026-08-01T09:20:00Z'));

    expect(service.macroInput()?.stale).toBe(false);
    expect(service.macroInput()?.staleNote).toBeNull();
    expect(service.macroStale()).toBe(false);
  });

  it('when the allocation input is read, it is never itself flagged stale', () => {
    const service = setup();

    service.readFundState(ALLOCATION_AT_0912, macroAt('2026-08-01T09:20:00Z'));

    expect(service.allocationInput()?.stale).toBe(false);
  });
});

// ===========================================================================
// Criterion — the error names the phase that failed
// ===========================================================================

describe('RiskAgentService — failure', () => {
  it('when the deterministic calculation fails, the error names the calculation phase', async () => {
    const service = setup();

    const run = service.recompute('calculation');
    await settle();
    await run;

    expect(service.state()).toBe('error');
    expect(service.error()?.phase).toBe('calculation');
    expect(service.error()?.message.toLowerCase()).toContain('calculation');
    expect(service.error()?.message.toLowerCase()).not.toContain('interpretation');
  });

  it('when the model interpretation fails, the error names the interpretation phase', async () => {
    const service = setup();

    const run = service.recompute('interpretation');
    await settle();
    await run;

    expect(service.state()).toBe('error');
    expect(service.error()?.phase).toBe('interpretation');
    expect(service.error()?.message.toLowerCase()).toContain('interpretation');
    expect(service.error()?.message.toLowerCase()).not.toContain('calculation');
  });

  it('when the error is cleared, the page returns to its populated view', async () => {
    const service = setup();

    const run = service.recompute(true);
    await settle();
    await run;
    service.clearError();

    expect(service.error()).toBeNull();
    expect(service.state()).toBe('ready');
  });
});

// ===========================================================================
// Criterion — re-running the assessment
// ===========================================================================

describe('RiskAgentService — recompute', () => {
  it('when the assessment is re-run, the page loads and then returns to ready', async () => {
    const service = setup();

    const run = service.recompute();

    expect(service.state()).toBe('loading');
    expect(service.canRun()).toBe(false);

    await settle();
    await run;

    expect(service.state()).toBe('ready');
    expect(service.canRun()).toBe(true);
  });

  it('when state.allocation is missing, re-running does nothing', async () => {
    const service = setup();
    service.readFundState(null, macroAt('2026-08-01T08:55:00Z'));

    const run = service.recompute();
    expect(service.state()).toBe('empty');

    await settle();
    await run;

    expect(service.state()).toBe('empty');
    expect(service.error()).toBeNull();
  });
});

// ===========================================================================
// Criterion — the run picker
// ===========================================================================

describe('RiskAgentService — run selection', () => {
  it('when the page opens, the latest run is selected', () => {
    const service = setup();

    expect(service.selectedRun()?.latest).toBe(true);
    expect(service.viewingHistoricalRun()).toBe(false);
  });

  it('when a past run is selected, the page says the run is no longer current', () => {
    const service = setup();
    const past = service.runs().find((r) => !r.latest)!;

    service.selectRun(past.id);

    expect(service.selectedRun()?.id).toBe(past.id);
    expect(service.viewingHistoricalRun()).toBe(true);
    expect(service.historicalRunNote()).not.toBeNull();
  });

  it('when a past run is selected, its own verdict and measures are shown', async () => {
    const service = setup();
    const latestVar = value(service, 'var');
    const past = service.runs().find((r) => !r.latest)!;

    service.selectRun(past.id);
    await settle();

    expect(value(service, 'var')).not.toBe(latestVar);
    expect(service.state()).toBe('ready');
  });

  /*
    The spec gives the empty state two causes — no allocation, or no run — and
    a different next step for each. A history that cannot be emptied leaves the
    second cause unreachable and its copy unread.
  */
  it('when the agent has not run yet, the page is empty even though the allocation is present', () => {
    const service = setup();

    service.clearRuns();

    expect(service.allocationInput()).not.toBeNull();
    expect(service.selectedRun()).toBeNull();
    expect(service.runOptions()).toHaveLength(0);
    expect(service.state()).toBe('empty');
    // Nothing to assess yet is not a reason to refuse the assessment.
    expect(service.canRun()).toBe(true);
  });

  it('when the first assessment finishes, the run enters the history and is selected', async () => {
    const service = setup();
    service.clearRuns();

    const run = service.recompute();
    await settle();
    await run;

    expect(service.state()).toBe('ready');
    expect(service.runs().length).toBeGreaterThan(0);
    expect(service.selectedRun()?.latest).toBe(true);
    expect(service.measures()).toHaveLength(5);
  });

  it('when the history is empty, selecting any run is refused', () => {
    const service = setup();
    service.clearRuns();

    service.selectRun('1247');

    expect(service.selectedRun()).toBeNull();
  });

  it('when an unknown run id is selected, the selection is left alone', () => {
    const service = setup();
    const current = service.selectedRun()?.id;

    service.selectRun('does-not-exist');

    expect(service.selectedRun()?.id).toBe(current);
  });
});

// ===========================================================================
// Criterion — the raw verdict disclosure
// ===========================================================================

describe('RiskAgentService — raw verdict', () => {
  it('when the raw verdict is opened, it holds every combination the tool computed', () => {
    const service = setup();
    const raw = service.rawVerdict()!;

    for (const method of VAR_METHODS) {
      expect(raw).toContain(method);
    }
    expect(raw).toContain('"wce": null');
  });

  it('when a filter changes, the raw verdict is unchanged — filters do not rewrite state', () => {
    const service = setup();
    const before = service.rawVerdict();

    service.confidence.set(99);
    service.method.set('historical');

    expect(service.rawVerdict()).toBe(before);
  });
});
