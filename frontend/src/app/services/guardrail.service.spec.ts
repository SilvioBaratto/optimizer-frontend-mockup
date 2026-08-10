import { TestBed } from '@angular/core/testing';

import {
  GUARDRAIL_REGIONS,
  GUARDRAIL_REGION_ERROR,
  HIGH_CONCENTRATION_DI,
  KILL_SWITCH_REASON_REQUIRED,
  KILL_SWITCH_UNKNOWN,
  KILL_SWITCH_WRITE_FAILURE,
  LIMIT_REASON_REQUIRED,
  NO_ORDERS_ROUTED,
  type LimitDraft,
} from '../models/guardrail.model';
import { ORDER_STAGES, type OrderStage } from '../models/order.model';
import { ExecutionService } from './execution.service';
import { GuardrailService } from './guardrail.service';
import { RiskAttributionService } from './risk-attribution.service';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function setup(): GuardrailService {
  TestBed.resetTestingModule();
  TestBed.configureTestingModule({});
  return TestBed.inject(GuardrailService);
}

/** Runs every pending timer the service scheduled, then lets the promise settle. */
async function run<T>(work: Promise<T>): Promise<T> {
  await vi.advanceTimersByTimeAsync(5_000);
  return work;
}

/** A draft the boundary accepts, so a case can spoil exactly one field. */
function draft(overrides: Partial<LimitDraft> = {}): LimitDraft {
  return {
    id: null,
    name: 'Max sleeve size',
    scope: 'position',
    validator: 'field_validator',
    threshold: 6,
    unit: 'pct-nav',
    enabled: true,
    ...overrides,
  };
}

beforeEach(() => {
  vi.useFakeTimers();
});

afterEach(() => {
  vi.useRealTimers();
});

// ===========================================================================
// Criterion — a failed kill-switch write changes nothing and says so
//
// The blocking review finding on the spec: an operator who believes trading is
// halted when it is not is the hazard the whole page exists to prevent, so the
// failure path is tested before the success path.
// ===========================================================================

describe('GuardrailService — a failed kill-switch write', () => {
  it('when the write fails, the kill-switch state is left exactly as it was', async () => {
    const service = setup();
    const before = service.killSwitch();

    const result = await run(service.setKillSwitch(true, 'Vendor feed outage', true));

    expect(result.ok).toBe(false);
    expect(service.killSwitch()).toEqual(before);
    expect(service.killSwitchEngaged()).toBe(false);
    expect(service.killSwitchStatus()).toBe('trading-enabled');
  });

  it('when the write fails, the result carries the failure and the unchanged state', async () => {
    const service = setup();
    const before = service.killSwitch();

    const result = await run(service.setKillSwitch(true, 'Vendor feed outage', true));

    expect(result.error).toBe(KILL_SWITCH_WRITE_FAILURE);
    expect(result.state).toEqual(before);
  });

  it('when the write fails, the failure is published so the dialog can stay open', async () => {
    const service = setup();

    await run(service.setKillSwitch(true, 'Vendor feed outage', true));

    expect(service.killSwitchActionError()).toBe(KILL_SWITCH_WRITE_FAILURE);
    expect(service.killSwitchWriting()).toBe(false);
  });

  it('when the write fails, nothing is written to the audit trail either', async () => {
    const service = setup();
    const before = service.events();

    await run(service.setKillSwitch(true, 'Vendor feed outage', true));

    expect(service.events()).toEqual(before);
  });

  it('when a failed write is retried and lands, the state changes and the error clears', async () => {
    const service = setup();
    await run(service.setKillSwitch(true, 'Vendor feed outage', true));

    const retried = await run(service.setKillSwitch(true, 'Vendor feed outage'));

    expect(retried.ok).toBe(true);
    expect(service.killSwitchEngaged()).toBe(true);
    expect(service.killSwitchActionError()).toBeNull();
  });

  it('when no rationale is given, the write is refused and the state is untouched', async () => {
    const service = setup();
    const before = service.killSwitch();

    const result = await run(service.setKillSwitch(true, '   '));

    expect(result.ok).toBe(false);
    expect(result.error).toBe(KILL_SWITCH_REASON_REQUIRED);
    expect(service.killSwitch()).toEqual(before);
    expect(service.killSwitchActionError()).toBe(KILL_SWITCH_REASON_REQUIRED);
  });
});

// ===========================================================================
// Criterion — a successful kill-switch write is fully recorded
// ===========================================================================

describe('GuardrailService — a successful kill-switch write', () => {
  it('when the write lands, the actor, the reason and the timestamp are recorded', async () => {
    const service = setup();
    const before = service.killSwitch();

    const result = await run(service.setKillSwitch(true, '  Vendor feed outage  '));

    const after = service.killSwitch();
    expect(result.ok).toBe(true);
    expect(after.engaged).toBe(true);
    expect(after.changedBy).toBe('risk.admin');
    expect(after.reason).toBe('Vendor feed outage');
    expect(after.changedAt).not.toBe(before.changedAt);
    expect(after.changedAt).toMatch(/^\d{4}-\d{2}-\d{2} \d{2}:\d{2} UTC$/);
    expect(result.state).toEqual(after);
  });

  it('when the write lands, the audit trail gains a row naming the actor and the reason', async () => {
    const service = setup();
    const before = service.events().length;

    await run(service.setKillSwitch(true, 'Vendor feed outage'));

    expect(service.events()).toHaveLength(before + 1);
    const newest = service.events()[0];
    expect(newest.actor).toBe('risk.admin');
    expect(newest.detail).toContain('Vendor feed outage');
    expect(newest.tradeId).toBeNull();
    expect(newest.stage).toBe('pre-trade');
  });

  it('when the switch is engaged, the audit row records that the boundary now refuses trades', async () => {
    const service = setup();

    await run(service.setKillSwitch(true, 'Vendor feed outage'));

    expect(service.events()[0].outcome).toBe('fail');
  });

  it('when the switch is released again, the boundary lets trades pass and says so', async () => {
    const service = setup();
    await run(service.setKillSwitch(true, 'Vendor feed outage'));

    await run(service.setKillSwitch(false, 'Feed restored, pre-check clean'));

    expect(service.killSwitchStatus()).toBe('trading-enabled');
    expect(service.events()[0].outcome).toBe('pass');
    expect(service.events()[0].detail).toContain('Feed restored');
  });

  it('when the switch is set to the state it already holds, nothing is recorded twice', async () => {
    const service = setup();
    const before = service.events();

    const result = await run(service.setKillSwitch(false, 'No change'));

    expect(result.ok).toBe(true);
    expect(service.events()).toEqual(before);
    expect(service.killSwitch().reason).not.toBe('No change');
  });
});

// ===========================================================================
// Criterion — saving a limit runs the same validators, verbatim
// ===========================================================================

describe('GuardrailService — the pass/fail boundary on save', () => {
  it('when the threshold is negative, the save is rejected with the validator’s own words', async () => {
    const service = setup();

    const result = await run(service.saveLimit(draft({ threshold: -3 })));

    expect(result.ok).toBe(false);
    expect(result.errors).toHaveLength(1);
    expect(result.errors[0].type).toBe('ValueError');
    expect(result.errors[0].field).toBe('threshold');
    expect(result.errors[0].message).toBe(
      'Value error, threshold must be a non-negative number, got -3.0',
    );
  });

  it('when a save is rejected, the message reaches the form unchanged', async () => {
    const service = setup();

    const result = await run(service.saveLimit(draft({ threshold: -3 })));

    expect(service.limitErrors()).toEqual(result.errors);
  });

  it('when a save is rejected, no limit is added or changed', async () => {
    const service = setup();
    const before = service.limits();

    await run(service.saveLimit(draft({ threshold: -3 })));

    expect(service.limits()).toEqual(before);
  });

  it('when the name is blank, the field validator refuses it', async () => {
    const service = setup();

    const result = await run(service.saveLimit(draft({ name: '   ' })));

    expect(result.ok).toBe(false);
    expect(result.errors[0].message).toBe('Value error, name must not be empty');
  });

  it('when the name is already taken, the custom error names the clash', async () => {
    const service = setup();

    const result = await run(service.saveLimit(draft({ name: 'Max gross exposure' })));

    expect(result.ok).toBe(false);
    expect(result.errors[0].type).toBe('PydanticCustomError');
    expect(result.errors[0].message).toContain('limit_name_not_unique');
    expect(result.errors[0].message).toContain("'Max gross exposure'");
  });

  it('when a bounded scope carries no threshold, the model validator refuses it', async () => {
    const service = setup();

    const result = await run(service.saveLimit(draft({ threshold: null })));

    expect(result.ok).toBe(false);
    expect(result.errors[0].field).toBeNull();
    expect(result.errors[0].message).toBe(
      'Value error, a position, exposure or concentration limit requires a threshold',
    );
  });

  it('when the threshold is zero, the model validator refuses a bound the field validator allows', async () => {
    const service = setup();

    const result = await run(service.saveLimit(draft({ threshold: 0 })));

    expect(result.ok).toBe(false);
    expect(result.errors[0].type).toBe('PydanticCustomError');
    expect(result.errors[0].message).toContain('limit_zero_budget');
  });

  it('when a % NAV bound on one name exceeds the whole book, it is refused', async () => {
    const service = setup();

    const result = await run(service.saveLimit(draft({ scope: 'concentration', threshold: 120 })));

    expect(result.ok).toBe(false);
    expect(result.errors[0].message).toBe(
      'Value error, a % NAV bound on a single position or name cannot exceed 100.0, got 120.0',
    );
  });

  it('when a kill-switch limit is given a threshold, it is refused — it is a predicate', async () => {
    const service = setup();

    const result = await run(
      service.saveLimit(draft({ scope: 'kill-switch', threshold: 5, unit: 'pct-nav' })),
    );

    expect(result.ok).toBe(false);
    expect(result.errors.map((e) => e.message)).toContain(
      'Value error, the kill-switch condition is a predicate and takes no threshold',
    );
  });

  it('when a gross exposure bound exceeds 100% NAV, leverage is allowed through', async () => {
    const service = setup();

    const result = await run(
      service.saveLimit(draft({ name: 'Max leverage', scope: 'exposure', threshold: 200 })),
    );

    expect(result.ok).toBe(true);
    expect(result.errors).toEqual([]);
  });

  it('when a valid limit is saved, it joins the grid with its own validator name', async () => {
    const service = setup();
    const before = service.limits().length;

    const result = await run(service.saveLimit(draft()));

    expect(result.ok).toBe(true);
    expect(service.limits()).toHaveLength(before + 1);
    expect(result.limit?.validatorName).toBe('max_sleeve_size');
    expect(result.limit?.status).toBe('ok');
    expect(service.limitErrors()).toEqual([]);
  });

  it('when an existing limit is edited, its evaluated status survives the edit', async () => {
    const service = setup();
    const breached = service.breachedLimits()[0];

    const result = await run(
      service.saveLimit({
        id: breached.id,
        name: breached.name,
        scope: breached.scope,
        validator: breached.validator,
        threshold: 14,
        unit: breached.unit,
        enabled: breached.enabled,
      }),
    );

    expect(result.ok).toBe(true);
    expect(service.limit(breached.id)?.threshold).toBe(14);
    expect(service.limit(breached.id)?.status).toBe('breach');
    expect(service.limit(breached.id)?.breachDetail).toBe(breached.breachDetail);
  });

  it('when the form pre-checks a draft, it gets the same answer the save would give', async () => {
    const service = setup();
    const invalid = draft({ threshold: -3 });

    const preview = service.validateLimit(invalid);
    const result = await run(service.saveLimit(invalid));

    expect(preview).toEqual(result.errors);
  });
});

// ===========================================================================
// Criterion — a disabled limit stays in the grid
// ===========================================================================

describe('GuardrailService — enabling and disabling limits', () => {
  it('when a limit is disabled, it keeps its place in the collection', () => {
    const service = setup();
    const before = service.limits().map((l) => l.id);
    const target = service.limits().find((l) => l.scope === 'position')!;

    const done = service.setLimitEnabled(target.id, false);

    expect(done).toBe(true);
    expect(service.limits().map((l) => l.id)).toEqual(before);
    expect(service.limit(target.id)?.enabled).toBe(false);
    expect(service.limitCount()).toBe(before.length);
  });

  it('when a limit is disabled, it drops out of the enforced set but not out of the grid', () => {
    const service = setup();
    const target = service.limits().find((l) => l.scope === 'position')!;

    service.setLimitEnabled(target.id, false);

    expect(service.enabledLimits().map((l) => l.id)).not.toContain(target.id);
    expect(service.limits().map((l) => l.id)).toContain(target.id);
  });

  it('when the seed is read, the disabled limit is already there and still listed', () => {
    const service = setup();

    const disabled = service.limits().filter((l) => !l.enabled);

    expect(disabled.length).toBeGreaterThan(0);
    expect(service.limits().length).toBeGreaterThan(service.enabledLimits().length);
  });

  it('when a kill-switch limit is switched off with no rationale, nothing changes', () => {
    const service = setup();
    const target = service.limits().find((l) => l.scope === 'kill-switch')!;

    const done = service.setLimitEnabled(target.id, false);

    expect(done).toBe(false);
    expect(service.limit(target.id)?.enabled).toBe(true);
    expect(service.limitActionError()).toBe(LIMIT_REASON_REQUIRED);
  });

  it('when a kill-switch limit is switched off with a rationale, it goes through and is audited', () => {
    const service = setup();
    const target = service.limits().find((l) => l.scope === 'kill-switch')!;
    const before = service.events().length;

    const done = service.setLimitEnabled(target.id, false, 'Superseded by the global switch');

    expect(done).toBe(true);
    expect(service.limit(target.id)?.enabled).toBe(false);
    expect(service.limitActionError()).toBeNull();
    expect(service.events()).toHaveLength(before + 1);
    expect(service.events()[0].detail).toContain('Superseded by the global switch');
  });

  it('when an unknown limit is toggled, nothing changes', () => {
    const service = setup();
    const before = service.limits();

    const done = service.setLimitEnabled('lim-does-not-exist', false);

    expect(done).toBe(false);
    expect(service.limits()).toEqual(before);
  });

  it('when a limit is in BREACH, it stays visible and in BREACH after a re-read', async () => {
    const service = setup();
    const breached = service.breachedLimits()[0];

    await run(service.refresh());

    expect(service.limit(breached.id)?.status).toBe('breach');
    expect(service.hasBreach()).toBe(true);
  });
});

// ===========================================================================
// Criterion — the pipeline counters are doc 15's order list, counted
// ===========================================================================

describe('GuardrailService — the approval pipeline', () => {
  it('when the counters are read, every step agrees with the one order list', () => {
    const service = setup();
    const execution = TestBed.inject(ExecutionService);
    const orders = execution.orders();

    ORDER_STAGES.forEach((stage, index) => {
      const step = service.pipelineByStage()[stage];
      const atStage = orders.filter((o) => o.stage === stage);

      expect(step.atStage, stage).toBe(execution.stageCounts()[stage]);
      expect(step.atStage, stage).toBe(atStage.length);
      expect(step.passed, stage).toBe(
        orders.filter((o) => ORDER_STAGES.indexOf(o.stage) > index).length,
      );
      expect(step.blocked, stage).toBe(atStage.filter((o) => o.status === 'blocked').length);
      expect(step.pending, stage).toBe(atStage.filter((o) => o.status === 'pending').length);
      expect(step.approved, stage).toBe(atStage.filter((o) => o.status === 'approved').length);
      expect(step.rejected, stage).toBe(atStage.filter((o) => o.status === 'rejected').length);
    });
  });

  it('when the steps are added up, they account for every proposed order once', () => {
    const service = setup();
    const execution = TestBed.inject(ExecutionService);

    const total = service.pipeline().reduce((sum, step) => sum + step.atStage, 0);

    expect(total).toBe(execution.totalCount());
  });

  it('when the gate is counted, it reports the same queue doc 15 and doc 16 read', () => {
    const service = setup();
    const execution = TestBed.inject(ExecutionService);

    expect(service.pipelineByStage()['human-gate'].pending).toBe(execution.pendingApprovalCount());
    const blocked = service.pipeline().reduce((sum, step) => sum + step.blocked, 0);
    expect(blocked).toBe(execution.blockedCount());
  });

  it('when the broker posture is not-configured, the broker-adapter step counts zero', () => {
    const service = setup();

    expect(service.brokerPosture()).toBe('not-configured');
    const step = service.pipelineByStage()['broker-adapter'];
    expect(step.atStage).toBe(0);
    expect(step.passed).toBe(0);
    expect(step.reachable).toBe(false);
    expect(step.summary).toBe(NO_ORDERS_ROUTED);
  });

  it('when the posture is read, it is doc 15’s signal rather than a second copy', () => {
    const service = setup();
    const execution = TestBed.inject(ExecutionService);

    expect(service.brokerPosture).toBe(execution.brokerPosture);
    expect(service.pipelineByStage()['broker-adapter'].subtitle).toBe('No broker configured');
  });

  it('when an adapter is registered, the fourth step becomes reachable', () => {
    const service = setup();
    const execution = TestBed.inject(ExecutionService);

    execution.setBroker({ posture: 'connected', adapter: 'IBKR', detail: null });

    const step = service.pipelineByStage()['broker-adapter'];
    expect(step.reachable).toBe(true);
    expect(step.summary).not.toBe(NO_ORDERS_ROUTED);
    expect(step.atStage).toBe(execution.stageCounts()['broker-adapter']);
  });

  it('when an adapter errors, sending is halted and the fourth step counts zero again', () => {
    const service = setup();
    const execution = TestBed.inject(ExecutionService);

    execution.setBroker({ posture: 'error', adapter: 'IBKR', detail: 'session dropped' });

    const step = service.pipelineByStage()['broker-adapter'];
    expect(step.reachable).toBe(false);
    expect(step.atStage).toBe(0);
    expect(step.summary).toBe(NO_ORDERS_ROUTED);
  });

  it('when the steps are listed, they are the four mandatory ones in order', () => {
    const service = setup();

    expect(service.pipeline().map((s) => s.stage)).toEqual([...ORDER_STAGES]);
    expect(service.pipeline().map((s) => s.step)).toEqual([1, 2, 3, 4]);
    expect(service.pipeline()[0].label).toBe('Pre-check');
    expect(service.pipeline()[2].label).toBe('Human Approval');
  });

  it('when a card prints its counters, the wording matches what the step decides', () => {
    const service = setup();
    const steps = service.pipelineByStage();

    expect(steps['pre-trade'].summary).toBe(
      `${steps['pre-trade'].passed} passed · ${steps['pre-trade'].blocked} blocked`,
    );
    expect(steps['human-gate'].summary).toBe(
      `${steps['human-gate'].approved} approved · ${steps['human-gate'].pending} pending`,
    );
  });
});

// ===========================================================================
// Criterion — the regions fail one at a time
// ===========================================================================

describe('GuardrailService — per-region failure', () => {
  it('when the limits fail to load, the other three regions are unaffected', async () => {
    const service = setup();

    await run(service.refresh(['limits']));

    expect(service.limitsError()).toBe(GUARDRAIL_REGION_ERROR.limits);
    expect(service.auditError()).toBeNull();
    expect(service.concentrationError()).toBeNull();
    expect(service.killSwitchError()).toBeNull();
    expect(service.state()).toBe('ready');
  });

  it('when the audit trail fails to load, the limits are still on screen', async () => {
    const service = setup();

    await run(service.refresh(['audit']));

    expect(service.auditError()).toBe(GUARDRAIL_REGION_ERROR.audit);
    expect(service.limitsError()).toBeNull();
    expect(service.limits().length).toBeGreaterThan(0);
  });

  it('when the concentration grid fails to load, only that region says so', async () => {
    const service = setup();

    await run(service.refresh(['concentration']));

    expect(service.concentrationError()).toBe(GUARDRAIL_REGION_ERROR.concentration);
    expect(service.limitsError()).toBeNull();
    expect(service.auditError()).toBeNull();
  });

  it('when the kill-switch cannot be read, the state is unknown and the toggle is held', async () => {
    const service = setup();

    await run(service.refresh(['kill-switch']));

    expect(service.killSwitchError()).toBe(KILL_SWITCH_UNKNOWN);
    expect(service.killSwitchKnown()).toBe(false);
    expect(service.killSwitchToggleDisabled()).toBe(true);
    expect(service.limitsError()).toBeNull();
  });

  it('when every region fails, the page is in error', async () => {
    const service = setup();

    await run(service.refresh(true));

    for (const region of GUARDRAIL_REGIONS) {
      expect(service.regionErrors()[region], region).toBe(GUARDRAIL_REGION_ERROR[region]);
    }
    expect(service.state()).toBe('error');
  });

  it('when one region is retried, it recovers without touching the others', async () => {
    const service = setup();
    await run(service.refresh(['limits', 'audit']));

    await run(service.retryRegion('limits'));

    expect(service.limitsError()).toBeNull();
    expect(service.auditError()).toBe(GUARDRAIL_REGION_ERROR.audit);
    expect(service.pendingRegion()).toBeNull();
  });

  it('when a retry fails again, the region keeps its error', async () => {
    const service = setup();
    await run(service.refresh(['audit']));

    await run(service.retryRegion('audit', true));

    expect(service.auditError()).toBe(GUARDRAIL_REGION_ERROR.audit);
  });

  it('when a region is being retried, only that region is named as pending', async () => {
    const service = setup();
    await run(service.refresh(['limits']));

    const work = service.retryRegion('limits');
    expect(service.pendingRegion()).toBe('limits');
    await run(work);

    expect(service.pendingRegion()).toBeNull();
  });
});

// ===========================================================================
// Criterion — loading, empty and recovery
// ===========================================================================

describe('GuardrailService — lifecycle', () => {
  it('when the page opens, everything is populated and trading is enabled', () => {
    const service = setup();

    expect(service.state()).toBe('ready');
    expect(service.killSwitchEngaged()).toBe(false);
    expect(service.killSwitchKnown()).toBe(true);
    expect(service.killSwitchToggleDisabled()).toBe(false);
    expect(service.limits().length).toBeGreaterThan(0);
    expect(service.events().length).toBeGreaterThan(0);
  });

  it('when a read is in flight, the page loads and the toggle is held disabled', async () => {
    const service = setup();

    const work = service.refresh();

    expect(service.state()).toBe('loading');
    expect(service.killSwitchKnown()).toBe(false);
    expect(service.killSwitchToggleDisabled()).toBe(true);

    await run(work);

    expect(service.state()).toBe('ready');
  });

  it('when a read fails, the kill-switch is never rewritten to a guess', async () => {
    const service = setup();
    const before = service.killSwitch();

    await run(service.refresh(true));

    expect(service.killSwitch()).toEqual(before);
  });

  it('when the snapshot holds nothing, the page is empty rather than in error', async () => {
    const service = setup();
    service.snapshotHasLimits.set(false);
    service.snapshotHasEvents.set(false);

    await run(service.refresh());

    expect(service.state()).toBe('empty');
    expect(service.limitsEmpty()).toBe(true);
    expect(service.eventsEmpty()).toBe(true);
    expect(service.exportDisabled()).toBe(true);
  });

  it('when a read lands, the timestamp moves and the errors clear', async () => {
    const service = setup();
    await run(service.refresh(true));
    const stamp = service.readAt();
    vi.advanceTimersByTime(120_000);

    await run(service.refresh());

    expect(service.limitsError()).toBeNull();
    expect(service.readAt()).not.toBe(stamp);
    expect(service.readAt()).toMatch(/^\d{4}-\d{2}-\d{2} \d{2}:\d{2} UTC$/);
    expect(service.state()).toBe('ready');
  });

  it('when a limit has been switched off, a re-read does not switch it back on', async () => {
    const service = setup();
    const target = service.limits().find((l) => l.scope === 'position')!;
    service.setLimitEnabled(target.id, false);

    await run(service.refresh());

    expect(service.limit(target.id)?.enabled).toBe(false);
  });
});

// ===========================================================================
// Criterion — the audit trail: filters, counts and paging
// ===========================================================================

describe('GuardrailService — the audit trail', () => {
  it('when the trail opens, one page is shown and there is more behind it', () => {
    const service = setup();

    expect(service.pagedEvents()).toHaveLength(6);
    expect(service.visibleEventCount()).toBeGreaterThan(6);
    expect(service.canLoadMore()).toBe(true);
  });

  it('when Load more is used, the next page joins the one already shown', () => {
    const service = setup();
    const first = service.pagedEvents();

    service.loadMore();

    expect(service.pagedEvents()).toHaveLength(12);
    expect(service.pagedEvents().slice(0, 6)).toEqual(first);
  });

  it('when every page has been loaded, Load more stops offering more', () => {
    const service = setup();

    for (let i = 0; i < 10; i++) service.loadMore();

    expect(service.pagedEvents()).toHaveLength(service.visibleEventCount());
    expect(service.canLoadMore()).toBe(false);
  });

  it('when a stage chip is switched off, its events leave the view but stay counted', () => {
    const service = setup();
    const preCheckCount = service.eventCountByStage()['pre-trade'];

    service.toggleStage('pre-trade');

    expect(preCheckCount).toBeGreaterThan(0);
    expect(service.visibleEvents().some((e) => e.stage === 'pre-trade')).toBe(false);
    expect(service.eventCountByStage()['pre-trade']).toBe(preCheckCount);
    expect(service.filtersActive()).toBe(true);
  });

  it('when a stage chip is switched back on, the chips return to reading order', () => {
    const service = setup();

    service.toggleStage('pre-trade');
    service.toggleStage('pre-trade');

    expect(service.stageFilter()).toEqual([...ORDER_STAGES]);
    expect(service.filtersActive()).toBe(false);
  });

  it('when a trade id is searched, only that trade’s checkpoints remain', () => {
    const service = setup();

    service.search.set('TRD-2033');

    expect(service.visibleEvents().length).toBeGreaterThan(0);
    for (const event of service.visibleEvents()) expect(event.tradeId).toBe('TRD-2033');
  });

  it('when View log is used on a limit, the trail narrows to that validator', () => {
    const service = setup();
    const breached = service.breachedLimits()[0];

    service.filterByValidator(breached.validatorName);

    expect(service.visibleEvents().length).toBeGreaterThan(0);
    for (const event of service.visibleEvents()) {
      expect(event.actor).toBe(breached.validatorName);
    }
  });

  it('when View log is used with that validator’s stage switched off, the stage is reopened', () => {
    const service = setup();
    const breached = service.breachedLimits()[0];
    const stage = service
      .events()
      .find((e) => e.actor === breached.validatorName)?.stage as OrderStage;

    service.toggleStage(stage);
    expect(service.stageFilter()).not.toContain(stage);

    service.filterByValidator(breached.validatorName);

    expect(service.stageFilter()).toContain(stage);
    expect(service.visibleEvents().length).toBeGreaterThan(0);
  });

  it('when the filters match nothing, the trail is empty and Export is refused', () => {
    const service = setup();

    service.search.set('TRD-0000');

    expect(service.visibleEvents()).toHaveLength(0);
    expect(service.eventsEmpty()).toBe(true);
    expect(service.exportDisabled()).toBe(true);
    expect(service.canLoadMore()).toBe(false);
  });

  it('when the filters are cleared, the whole trail comes back on its first page', () => {
    const service = setup();
    service.search.set('TRD-2033');
    service.loadMore();

    service.clearFilters();

    expect(service.visibleEventCount()).toBe(service.events().length);
    expect(service.pagedEvents()).toHaveLength(6);
  });

  it('when the filtered view is exported, it carries exactly the rows on screen', () => {
    const service = setup();
    service.search.set('TRD-2033');

    const csv = service.exportCsv().split('\n');

    expect(csv).toHaveLength(service.visibleEvents().length + 1);
    expect(csv[0]).toBe('date,time,trade,stage,outcome,actor,detail');
    expect(csv[1]).toContain('TRD-2033');
  });

  it('when a failure is recorded, it keeps the original exception text for the drawer', () => {
    const service = setup();

    const failure = service.events().find((e) => e.actor === 'concentration_limit')!;

    expect(failure.outcome).toBe('fail');
    expect(failure.errorType).toBe('PydanticCustomError');
    expect(failure.detail).toContain('1 validation error for ProposedOrder');
    expect(failure.detail).toContain('concentration_limit');
  });

  it('when a row is selected, the drawer reads that event; an unknown id is ignored', () => {
    const service = setup();
    const first = service.events()[0];

    service.selectEvent(first.id);
    expect(service.selectedEvent()).toEqual(first);

    service.selectEvent('gev-nope');
    expect(service.selectedEvent()).toEqual(first);

    service.selectEvent(null);
    expect(service.selectedEvent()).toBeNull();
  });

  it('when the trail is read, every checkpoint sits at one of the four steps', () => {
    const service = setup();

    for (const event of service.events()) {
      expect(ORDER_STAGES).toContain(event.stage as OrderStage);
    }
  });
});

// ===========================================================================
// Criterion — the concentration grid is Risk Attribution's, not a second one
// ===========================================================================

describe('GuardrailService — risk concentration', () => {
  it('when the diversification index is read, it is the one Risk Attribution published', () => {
    const service = setup();
    const attribution = TestBed.inject(RiskAttributionService);

    expect(service.portfolioDi).toBe(attribution.portfolioDi);
    expect(service.portfolioDi()).toBe(attribution.portfolioDi());
  });

  it('when the components are listed, they are the attributed book, heaviest first', () => {
    const service = setup();
    const attribution = TestBed.inject(RiskAttributionService);

    const components = service.concentrationComponents();
    expect(components).toHaveLength(attribution.marginalDiByComponent().length);

    const weights = components.map((c) => c.weight);
    expect(weights).toEqual([...weights].sort((a, b) => b - a));
  });

  it('when a component is flagged, its marginal DI is what earned the flag', () => {
    const service = setup();

    for (const component of service.concentrationComponents()) {
      if (component.highConcentration) {
        expect(component.marginalDi, component.id).not.toBeNull();
        expect(component.marginalDi!, component.id).toBeGreaterThanOrEqual(HIGH_CONCENTRATION_DI);
      }
    }
  });

  it('when a component has no marginal DI, it is never flagged as concentrated', () => {
    const service = setup();

    for (const component of service.concentrationComponents()) {
      if (component.marginalDi === null) expect(component.highConcentration, component.id).toBe(false);
    }
  });

  it('when the grid opens, it previews four components and offers the rest', () => {
    const service = setup();

    expect(service.visibleConcentrationComponents()).toHaveLength(4);
    expect(service.concentrationHidden()).toBe(service.concentrationComponents().length - 4);
  });

  it('when Show all components is used, the whole book is listed', () => {
    const service = setup();

    service.showAllComponents.set(true);

    expect(service.visibleConcentrationComponents()).toEqual(service.concentrationComponents());
    expect(service.concentrationHidden()).toBe(0);
  });
});
