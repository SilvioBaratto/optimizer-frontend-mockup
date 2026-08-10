import { TestBed } from '@angular/core/testing';

import {
  INFEASIBLE_MESSAGE,
  IMPACT_MEASURE_UNIT,
  K_DEFAULT,
  REVERSE_UNREACHABLE_MESSAGE,
  type LossContribution,
  type RiskFactorRow,
  type ScenarioResult,
} from '../models/stress-testing.model';
import { StressTestingService } from './stress-testing.service';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function setup(): StressTestingService {
  TestBed.configureTestingModule({});
  return TestBed.inject(StressTestingService);
}

/** Runs every timer the service scheduled, then lets its promise settle. */
async function settle(work: Promise<void>): Promise<void> {
  await vi.advanceTimersByTimeAsync(5_000);
  await work;
}

function factor(service: StressTestingService, id: string): RiskFactorRow {
  const row = service.factors().find((f) => f.id === id);
  if (!row) throw new Error(`no ${id} row in the factor table`);
  return row;
}

function contribution(service: StressTestingService, id: string): LossContribution {
  const row = service.maximumLossContributions().find((f) => f.factorId === id);
  if (!row) throw new Error(`no ${id} contribution`);
  return row;
}

/** The four numbers a result is judged on, for "nothing was recomputed". */
function figuresOf(result: ScenarioResult): readonly number[] {
  return [result.maha, result.cep, result.loss, result.k];
}

/** The wireframe's hand-picked scenario: a single 18% fall in the equity market. */
async function evaluateEquityCrash(service: StressTestingService): Promise<void> {
  service.setFactorFixed('equity', true);
  service.setFactorValue('equity', -18);
  await settle(service.evaluateManual());
}

async function runWorstCaseAt(service: StressTestingService, k: number): Promise<void> {
  service.setK(k);
  await settle(service.runWorstCase());
}

beforeEach(() => {
  vi.useFakeTimers();
});

afterEach(() => {
  vi.useRealTimers();
});

// ===========================================================================
// Criterion — the default view
// ===========================================================================

describe('StressTestingService — the page as it opens', () => {
  it('when the page opens, the toolbar carries the specified defaults', () => {
    const service = setup();

    expect(service.impactMeasure()).toBe('regulatory-capital');
    expect(service.k()).toBe(5);
    expect(service.mode()).toBe('forward');
    expect(service.measureUnit()).toBe('% RWA');
    expect(service.ellipsoidLabel()).toBe('Ell_k = { r : Maha(r) <= 5.00 }');
  });

  it('when nothing has been run, the page is empty but the expected scenario is already there', () => {
    const service = setup();

    expect(service.state()).toBe('empty');
    expect(service.manualResult()).toBeNull();
    expect(service.worstCaseResult()).toBeNull();
    expect(service.reverseResult()).toBeNull();
    expect(service.maximumLossContributions()).toHaveLength(0);

    const expected = service.expectedResult();
    expect(expected.cep).toBeCloseTo(4.2, 9);
    expect(expected.loss).toBe(0);
    expect(expected.maha).toBe(0);
    expect(expected.unit).toBe('% RWA');
  });

  it('when the factor table is read, every factor is unfixed and held at its conditional expected value', () => {
    const service = setup();

    const rows = service.factors();
    expect(rows).toHaveLength(4);
    for (const row of rows) {
      expect(row.fixed, row.id).toBe(false);
      expect(row.editable, row.id).toBe(false);
      expect(row.scenarioValue, row.id).toBeNull();
      expect(row.effectiveValue, row.id).toBe(row.conditionalValue);
    }
    // Nothing is fixed, so the conditional expectation is the unconditional one.
    expect(factor(service, 'equity').conditionalValue).toBeCloseTo(0.6, 9);
    expect(factor(service, 'fx-eurusd').conditionalValue).toBeCloseTo(0, 9);
    expect(service.fixedMaha()).toBe(0);
  });

  it('when the library is read, it holds the four saved rows the wireframe lists', () => {
    const service = setup();

    expect(service.library()).toHaveLength(4);
    expect(service.library().map((row) => row.kind)).toEqual([
      'manual',
      'worst-case',
      'worst-case',
      'reverse',
    ]);
    expect(service.libraryCount()).toBe(4);
  });
});

// ===========================================================================
// Criterion — changing k marks results stale and recomputes nothing
// ===========================================================================

describe('StressTestingService — the radius goes stale, it does not recompute', () => {
  it('when k changes after a search, the worst case is marked stale and its figures do not move', async () => {
    const service = setup();
    await settle(service.runWorstCase());
    const before = service.worstCaseResult()!;
    expect(before.stale).toBe(false);
    const figures = figuresOf(before);

    service.setK(8);

    const after = service.worstCaseResult()!;
    expect(after.stale).toBe(true);
    expect(figuresOf(after)).toEqual(figures);
    // The result still names the radius it was computed at, not the new one.
    expect(after.k).toBe(5);
    expect(service.k()).toBe(8);
    expect(after.maha).toBe(5);
  });

  it('when k changes, the contributions computed for the old worst case are left exactly as they were', async () => {
    const service = setup();
    await settle(service.runWorstCase());
    const before = service.maximumLossContributions();

    service.setK(9);

    expect(service.maximumLossContributions()).toEqual(before);
  });

  it('when k changes, every result on screen goes stale together', async () => {
    const service = setup();
    await evaluateEquityCrash(service);
    service.setFactorFixed('equity', false);
    await settle(service.runWorstCase());
    service.setReverseTargetLevel(8);
    await settle(service.searchReverse());

    service.setK(6.5);

    expect(service.expectedResult().stale).toBe(true);
    expect(service.manualResult()!.stale).toBe(true);
    expect(service.worstCaseResult()!.stale).toBe(true);
    expect(service.reverseResult()!.stale).toBe(true);
    expect(service.anyStale()).toBe(true);
  });

  it('when k is set to the value it already has, nothing is marked stale', async () => {
    const service = setup();
    await settle(service.runWorstCase());

    service.setK(K_DEFAULT);

    expect(service.worstCaseResult()!.stale).toBe(false);
    expect(service.anyStale()).toBe(false);
  });

  it('when the search is re-run at the new radius, the result is current again and the figures move', async () => {
    const service = setup();
    await settle(service.runWorstCase());
    const atFive = figuresOf(service.worstCaseResult()!);

    service.setK(6);
    await settle(service.runWorstCase());

    const atSix = service.worstCaseResult()!;
    expect(atSix.stale).toBe(false);
    expect(atSix.k).toBe(6);
    expect(atSix.maha).toBeCloseTo(6, 12);
    expect(figuresOf(atSix)).not.toEqual(atFive);
    expect(atSix.loss).toBeLessThan(atFive[2]);
  });
});

// ===========================================================================
// Criterion — changing the impact measure does the same
// ===========================================================================

describe('StressTestingService — the impact measure goes stale, it does not recompute', () => {
  it('when the measure changes after a search, the result is stale and keeps the unit it was computed in', async () => {
    const service = setup();
    await settle(service.runWorstCase());
    const figures = figuresOf(service.worstCaseResult()!);

    service.setImpactMeasure('asset-values');

    const after = service.worstCaseResult()!;
    expect(after.stale).toBe(true);
    expect(figuresOf(after)).toEqual(figures);
    expect(after.measure).toBe('regulatory-capital');
    expect(after.unit).toBe('% RWA');
    // The toolbar has moved on; the card has not, and says so.
    expect(service.measureUnit()).toBe('% NAV');
  });

  it('when the measure changes, the expected scenario goes stale rather than being rescaled', () => {
    const service = setup();
    const before = service.expectedResult().cep;

    service.setImpactMeasure('economic-capital');

    expect(service.expectedResult().cep).toBe(before);
    expect(service.expectedResult().stale).toBe(true);
  });

  it('when the search is re-run under the new measure, both the figures and the unit follow it', async () => {
    const service = setup();
    await settle(service.runWorstCase());

    service.setImpactMeasure('asset-values');
    await settle(service.runWorstCase());

    const after = service.worstCaseResult()!;
    expect(after.stale).toBe(false);
    expect(after.measure).toBe('asset-values');
    expect(after.unit).toBe(IMPACT_MEASURE_UNIT['asset-values']);
    expect(service.expectedResult().cep).toBeCloseTo(2.6, 9);
    // The same stress read against another denominator is another number.
    expect(after.loss).toBeCloseTo(-6.6 * 0.62, 9);
  });

  it('when the measure is set to the one already selected, nothing is marked stale', async () => {
    const service = setup();
    await settle(service.runWorstCase());

    service.setImpactMeasure('regulatory-capital');

    expect(service.worstCaseResult()!.stale).toBe(false);
  });
});

// ===========================================================================
// Criterion — a factor that is not fixed cannot be given a value
// ===========================================================================

describe('StressTestingService — the fix column', () => {
  it('when a factor is not fixed, a value written to it is refused and not kept in the wings', () => {
    const service = setup();

    service.setFactorValue('fx-eurusd', 9);

    const row = factor(service, 'fx-eurusd');
    expect(row.scenarioValue).toBeNull();
    expect(row.effectiveValue).toBe(row.conditionalValue);
    expect(service.canEvaluateManual()).toBe(false);
    expect(service.fixedMaha()).toBe(0);

    // Ticking Fix afterwards must not resurrect a shock nobody could see.
    service.setFactorFixed('fx-eurusd', true);

    expect(factor(service, 'fx-eurusd').scenarioValue).toBeNull();
    expect(service.canEvaluateManual()).toBe(false);
    expect(service.fixedMaha()).toBe(0);
  });

  it('when a factor is fixed, its value becomes editable and is taken as written', () => {
    const service = setup();

    service.setFactorFixed('fx-eurusd', true);
    service.setFactorValue('fx-eurusd', 9);

    const row = factor(service, 'fx-eurusd');
    expect(row.editable).toBe(true);
    expect(row.scenarioValue).toBe(9);
    expect(row.effectiveValue).toBe(9);
    expect(service.canEvaluateManual()).toBe(true);
  });

  it('when a factor is released, the shock it carried goes with it', () => {
    const service = setup();
    service.setFactorFixed('equity', true);
    service.setFactorValue('equity', -18);

    service.setFactorFixed('equity', false);

    expect(factor(service, 'equity').scenarioValue).toBeNull();
    expect(service.canEvaluateManual()).toBe(false);
  });

  it('when one factor is fixed, the others move to their conditional expected value', () => {
    const service = setup();

    service.setFactorFixed('equity', true);
    service.setFactorValue('equity', -18);

    // Equity crashes: spreads widen, yields fall, the FX leg barely moves.
    expect(factor(service, 'credit-spread').conditionalValue).toBeGreaterThan(50);
    expect(factor(service, 'rate-10y').conditionalValue).toBeLessThan(0);
    expect(Math.abs(factor(service, 'fx-eurusd').conditionalValue)).toBeLessThan(1);
    for (const row of service.factors()) {
      if (row.id === 'equity') continue;
      expect(row.editable, row.id).toBe(false);
      expect(row.effectiveValue, row.id).toBe(row.conditionalValue);
    }
  });

  it('when a factor is fixed, the plausibility of the partial scenario is that of the fixed factor alone', () => {
    const service = setup();

    service.setFactorFixed('equity', true);
    service.setFactorValue('equity', -18);

    // The source's hand-picked scenario is a 5.42 sigma event.
    expect(service.fixedMaha()).toBeCloseTo(5.42, 2);
  });

  it('when the fixed set changes, the manual result is marked stale and the worst case is not', async () => {
    const service = setup();
    await settle(service.runWorstCase());
    await evaluateEquityCrash(service);
    const worstCase = service.worstCaseResult()!;

    service.setFactorValue('equity', -20);

    expect(service.manualResult()!.stale).toBe(true);
    expect(service.worstCaseResult()).toBe(worstCase);
    expect(service.worstCaseResult()!.stale).toBe(false);
  });
});

// ===========================================================================
// Criterion — the worst case sits exactly on the boundary of Ell_k
// ===========================================================================

describe('StressTestingService — the worst case is on the boundary', () => {
  it('when the search runs, the worst case has Maha exactly equal to k', async () => {
    const service = setup();

    for (const k of [1.5, 3, 5, 6.25, 9, 12]) {
      await runWorstCaseAt(service, k);
      const result = service.worstCaseResult()!;
      expect(result.maha, `k=${k}`).toBeCloseTo(k, 12);
      expect(result.onBoundary, `k=${k}`).toBe(true);
      expect(result.withinEllipsoid, `k=${k}`).toBe(true);
    }
  });

  it('when factors are fixed inside Ell_k, the constrained worst case is still on the boundary', async () => {
    const service = setup();
    service.setFactorFixed('equity', true);
    service.setFactorValue('equity', -18);

    await runWorstCaseAt(service, 7);

    const result = service.worstCaseResult()!;
    expect(result.maha).toBeCloseTo(7, 12);
    expect(result.onBoundary).toBe(true);
    // The pinned factor is untouched by the search.
    const equity = result.factors.find((f) => f.factorId === 'equity')!;
    expect(equity.value).toBeCloseTo(-18, 9);
    expect(equity.fixed).toBe(true);
  });

  it('when the worst case is read at the default radius, it matches the worked example', async () => {
    const service = setup();

    await settle(service.runWorstCase());

    const result = service.worstCaseResult()!;
    expect(result.maha).toBe(5);
    expect(result.cep).toBeCloseTo(-2.4, 6);
    expect(result.loss).toBeCloseTo(-6.6, 6);
    expect(result.unit).toBe('% RWA');
    expect(result.loss).toBeCloseTo(result.cep - service.expectedResult().cep, 9);
  });

  it('when the radius is widened, the worst case is more severe and less plausible', async () => {
    const service = setup();
    await runWorstCaseAt(service, 4);
    const narrow = service.worstCaseResult()!;

    await runWorstCaseAt(service, 8);

    const wide = service.worstCaseResult()!;
    expect(wide.loss).toBeLessThan(narrow.loss);
    expect(wide.maha).toBeGreaterThan(narrow.maha);
  });
});

// ===========================================================================
// Criterion — fixed factors outside Ell_k make the search infeasible
// ===========================================================================

describe('StressTestingService — an infeasible admissible set', () => {
  it('when the fixed factors already sit outside Ell_k, the search reports infeasible instead of a point', async () => {
    const service = setup();
    service.setFactorFixed('equity', true);
    service.setFactorValue('equity', -18);
    expect(service.fixedMaha()).toBeGreaterThan(service.k());
    expect(service.partialScenarioFeasible()).toBe(false);

    await settle(service.runWorstCase());

    expect(service.worstCaseResult()).toBeNull();
    expect(service.maximumLossContributions()).toHaveLength(0);
    expect(service.state()).toBe('error');
    expect(service.error()?.section).toBe('worst-case');
    expect(service.error()?.message).toBe(INFEASIBLE_MESSAGE);
    expect(service.error()?.detail).toContain('raise the plausibility radius');
  });

  it('when the search is infeasible, an earlier worst case is left standing rather than cleared', async () => {
    const service = setup();
    await settle(service.runWorstCase());
    const earlier = service.worstCaseResult()!;

    service.setFactorFixed('equity', true);
    service.setFactorValue('equity', -18);
    await settle(service.runWorstCase());

    expect(service.worstCaseResult()).toBe(earlier);
    expect(service.error()?.message).toBe(INFEASIBLE_MESSAGE);
  });

  it('when the radius is raised past the fixed scenario, the same search converges', async () => {
    const service = setup();
    service.setFactorFixed('equity', true);
    service.setFactorValue('equity', -18);
    await settle(service.runWorstCase());
    expect(service.error()).not.toBeNull();

    await runWorstCaseAt(service, 6);

    expect(service.error()).toBeNull();
    expect(service.worstCaseResult()!.maha).toBeCloseTo(6, 12);
    expect(service.partialScenarioFeasible()).toBe(true);
  });

  it('when a hand-picked scenario is less plausible than the radius, evaluating it is still allowed', async () => {
    const service = setup();

    await evaluateEquityCrash(service);

    const result = service.manualResult()!;
    expect(result.maha).toBeCloseTo(5.42, 2);
    expect(result.withinEllipsoid).toBe(false);
    expect(service.error()).toBeNull();
  });

  it('when the hand-picked scenario is evaluated, it matches the worked example', async () => {
    const service = setup();

    await evaluateEquityCrash(service);

    const result = service.manualResult()!;
    expect(result.cep).toBeCloseTo(1.1, 1);
    expect(result.loss).toBeCloseTo(-3.1, 1);
    expect(result.label).toContain('Equity market -18.0%');
  });

  it('when the hand-picked scenario is compared with the systematic one, it is far milder despite being less plausible', async () => {
    const service = setup();
    await evaluateEquityCrash(service);
    service.setFactorFixed('equity', false);
    await settle(service.runWorstCase());

    const manual = service.manualResult()!;
    const worst = service.worstCaseResult()!;
    expect(manual.maha).toBeGreaterThan(worst.maha);
    expect(manual.loss).toBeGreaterThan(worst.loss);
  });
});

// ===========================================================================
// Criterion — the loss contributions are kept as generated
// ===========================================================================

describe('StressTestingService — maximum loss contributions', () => {
  it('when the worst case is decomposed, the contributions are the documented ones', async () => {
    const service = setup();

    await settle(service.runWorstCase());

    expect(service.maximumLossContributions().map((row) => row.factorId)).toEqual([
      'fx-eurusd',
      'equity',
      'credit-spread',
      'rate-10y',
    ]);
    expect(contribution(service, 'fx-eurusd').share * 100).toBeCloseTo(68.4, 1);
    expect(contribution(service, 'equity').share * 100).toBeCloseTo(17.9, 1);
    expect(contribution(service, 'credit-spread').share * 100).toBeCloseTo(4.2, 1);
    expect(contribution(service, 'rate-10y').share * 100).toBeCloseTo(1.5, 1);
  });

  it('when the contributions are added up, they are not normalised to one', async () => {
    const service = setup();

    await settle(service.runWorstCase());

    expect(service.contributionSum()).toBeCloseTo(0.92, 3);
    expect(service.contributionSum()).toBeLessThan(1);
    expect(service.contributionResidual()).toBeCloseTo(0.08, 3);
  });

  it('when the contributions fall short of 100%, the interaction is reported as negative', async () => {
    const service = setup();

    await settle(service.runWorstCase());

    expect(service.contributionInteraction()).toBe('negative');
  });

  it('when a contribution is read, it is the loss of that factor alone over the loss of the whole move', async () => {
    const service = setup();

    await settle(service.runWorstCase());

    const total = -service.worstCaseResult()!.loss;
    for (const row of service.maximumLossContributions()) {
      expect(row.share, row.factorId).toBeCloseTo(row.individualLoss / total, 9);
    }
    // Negative interaction, stated as the arithmetic it is: the joint move
    // costs more than the individual moves add up to.
    const individual = service
      .maximumLossContributions()
      .reduce((sum, row) => sum + row.individualLoss, 0);
    expect(individual).toBeLessThan(total);
  });

  it('when the contributions are ranked, only the factors above the key share are marked drivers', async () => {
    const service = setup();

    await settle(service.runWorstCase());

    expect(contribution(service, 'fx-eurusd').driver).toBe(true);
    expect(contribution(service, 'equity').driver).toBe(true);
    expect(contribution(service, 'credit-spread').driver).toBe(false);
    expect(contribution(service, 'rate-10y').driver).toBe(false);
  });

  it('when no search has run, there are no contributions and no interaction to report', () => {
    const service = setup();

    expect(service.maximumLossContributions()).toHaveLength(0);
    expect(service.contributionInteraction()).toBe('none');
  });
});

// ===========================================================================
// Criterion — the library
// ===========================================================================

describe('StressTestingService — the scenario library', () => {
  it('when a row is deleted, exactly that row goes', () => {
    const service = setup();
    const before = service.library().map((row) => row.id);

    const removed = service.deleteScenario('saved-2');

    expect(removed).toBe(true);
    expect(service.library().map((row) => row.id)).toEqual(
      before.filter((id) => id !== 'saved-2'),
    );
    expect(service.library()).toHaveLength(3);
  });

  it('when an unknown row is deleted, the library is untouched', () => {
    const service = setup();
    const before = service.library();

    expect(service.deleteScenario('saved-999')).toBe(false);
    expect(service.library()).toBe(before);
  });

  it('when a result is saved, the row records the parameters it was computed at', async () => {
    const service = setup();
    service.setK(7);
    await settle(service.runWorstCase());

    const id = service.saveScenario();

    const row = service.library().find((entry) => entry.id === id)!;
    expect(row.kind).toBe('worst-case');
    expect(row.k).toBe(7);
    expect(row.maha).toBeCloseTo(7, 12);
    expect(row.measure).toBe('regulatory-capital');
    expect(row.unit).toBe('% RWA');
    expect(row.cep).toBeCloseTo(service.worstCaseResult()!.cep, 12);
    expect(service.library()).toHaveLength(5);
  });

  it('when nothing has been run, there is nothing to save', () => {
    const service = setup();

    expect(service.canSave()).toBe(false);
    expect(service.saveScenario()).toBeNull();
    expect(service.library()).toHaveLength(4);
  });

  it('when a manual row is loaded, the parameters and the fixed factors come back with it', () => {
    const service = setup();
    service.setK(9);

    expect(service.loadScenario('saved-1')).toBe(true);

    expect(service.k()).toBe(5);
    expect(service.mode()).toBe('forward');
    expect(factor(service, 'equity').fixed).toBe(true);
    expect(factor(service, 'equity').scenarioValue).toBe(-18);
    const result = service.manualResult()!;
    expect(result.stale).toBe(false);
    expect(result.maha).toBeCloseTo(5.42, 2);
  });

  it('when a row is loaded, the figures it stored are the ones the model derives again', () => {
    const service = setup();
    const row = service.library().find((entry) => entry.id === 'saved-3')!;

    service.loadScenario('saved-3');

    const result = service.worstCaseResult()!;
    expect(result.k).toBe(6);
    expect(result.maha).toBeCloseTo(row.maha, 12);
    expect(result.cep).toBeCloseTo(row.cep!, 12);
    expect(result.loss).toBeCloseTo(row.loss!, 12);
  });

  it('when a row is loaded, results computed at the displaced parameters are marked stale', async () => {
    const service = setup();
    await settle(service.runWorstCase());
    const figures = figuresOf(service.worstCaseResult()!);

    service.loadScenario('saved-1');

    const worstCase = service.worstCaseResult()!;
    expect(worstCase.stale).toBe(true);
    expect(figuresOf(worstCase)).toEqual(figures);
  });

  it('when a reverse row is loaded, the page switches to the reverse mode with its target', () => {
    const service = setup();

    service.loadScenario('saved-4');

    expect(service.mode()).toBe('reverse');
    expect(service.reverseOutcome()).toBe('capital-ratio-breach');
    expect(service.reverseTargetLevel()).toBe(8);
    expect(service.reverseResult()!.minimalMaha).toBeCloseTo(4.1, 2);
  });

  it('when the library is filtered by type, only those rows are listed', () => {
    const service = setup();

    service.setLibraryFilter('worst-case');

    expect(service.visibleLibrary()).toHaveLength(2);
    expect(service.visibleLibrary().every((row) => row.kind === 'worst-case')).toBe(true);
    expect(service.library()).toHaveLength(4);

    service.setLibraryFilter('all');
    expect(service.visibleLibrary()).toHaveLength(4);
  });
});

// ===========================================================================
// Criterion — the reverse stress test
// ===========================================================================

describe('StressTestingService — the reverse stress test', () => {
  it('when no target level is entered, the search cannot run', () => {
    const service = setup();

    expect(service.reverseTargetLevel()).toBeNull();
    expect(service.canSearchReverse()).toBe(false);
  });

  it('when a capital breach is asked for, the search reports the minimal plausibility it costs', async () => {
    const service = setup();
    service.setReverseTargetLevel(8);

    await settle(service.searchReverse());

    const result = service.reverseResult()!;
    expect(result.currentLevel).toBe(13.3);
    expect(result.requiredLoss).toBeCloseTo(5.3, 9);
    expect(result.minimalMaha).toBeCloseTo(4.1, 2);
    expect(result.unit).toBe('% RWA');
    expect(result.withinCurrentRadius).toBe(true);
    expect(result.scenario).toHaveLength(4);
    expect(result.scenario.filter((move) => move.driver).map((move) => move.factorId)).toEqual([
      'equity',
      'fx-eurusd',
    ]);
  });

  /*
    The two exercises run on one and the same loss surface, so the scenario the
    reverse search reports has to be the scenario a forward search would find at
    that radius — otherwise the page would be answering its own question two
    ways. The comparison is relative because the toolbar quotes k to two
    decimals: the forward run happens at 4.10, the reverse answer is 4.1007.
  */
  it('when the implied scenario is run forward at that radius, it reaches the target level', async () => {
    const service = setup();
    service.setReverseTargetLevel(8);
    await settle(service.searchReverse());
    const reverse = service.reverseResult()!;

    await runWorstCaseAt(service, reverse.minimalMaha);

    const forward = service.worstCaseResult()!;
    expect(-forward.loss / reverse.requiredLoss).toBeCloseTo(1, 3);
    for (const move of reverse.scenario) {
      const same = forward.factors.find((f) => f.factorId === move.factorId)!;
      expect(same.value / move.value, move.factorId).toBeCloseTo(1, 3);
    }
  });

  it('when the outcome is survival itself, no plausible radius reaches it and the page says so', async () => {
    const service = setup();
    service.setReverseOutcome('insolvency');
    service.setReverseTargetLevel(0);

    await settle(service.searchReverse());

    expect(service.reverseResult()).toBeNull();
    expect(service.error()?.section).toBe('reverse');
    expect(service.error()?.message).toBe(REVERSE_UNREACHABLE_MESSAGE);
  });

  it('when the target is at or above the current reading, the search refuses it with a reason', async () => {
    const service = setup();
    service.setReverseTargetLevel(14);

    await settle(service.searchReverse());

    expect(service.reverseResult()).toBeNull();
    expect(service.error()?.section).toBe('reverse');
    expect(service.error()?.detail).toContain('below the current one');
  });

  it('when the impact measure changes, the reverse result goes stale like everything else', async () => {
    const service = setup();
    service.setReverseTargetLevel(8);
    await settle(service.searchReverse());
    const minimal = service.reverseResult()!.minimalMaha;

    service.setImpactMeasure('asset-values');

    expect(service.reverseResult()!.stale).toBe(true);
    expect(service.reverseResult()!.minimalMaha).toBe(minimal);
    expect(service.reverseResult()!.measure).toBe('regulatory-capital');
  });

  it('when the same target is searched under another measure, it costs a different plausibility', async () => {
    const service = setup();
    service.setReverseTargetLevel(8);
    await settle(service.searchReverse());
    const underRwa = service.reverseResult()!.minimalMaha;

    service.setImpactMeasure('asset-values');
    await settle(service.searchReverse());

    expect(service.reverseResult()!.minimalMaha).toBeGreaterThan(underRwa);
    expect(service.reverseResult()!.unit).toBe('% NAV');
  });
});

// ===========================================================================
// Criterion — the severity comparison reads the three results
// ===========================================================================

describe('StressTestingService — the severity comparison', () => {
  it('when only the expected scenario exists, the chart has one bar', () => {
    const service = setup();

    expect(service.severityBars()).toHaveLength(1);
    expect(service.severityBars()[0].kind).toBe('expected');
  });

  it('when both searches have run, the three bars are ordered and the worst case is annotated', async () => {
    const service = setup();
    await evaluateEquityCrash(service);
    service.setFactorFixed('equity', false);
    await settle(service.runWorstCase());

    const bars = service.severityBars();
    expect(bars.map((bar) => bar.kind)).toEqual(['expected', 'manual', 'worst-case']);
    expect(bars[2].annotation).toBe('Maximum Loss');
    expect(bars[0].cep).toBeGreaterThan(bars[1].cep);
    expect(bars[1].cep).toBeGreaterThan(bars[2].cep);
    expect(bars.every((bar) => bar.unit === '% RWA')).toBe(true);
  });

  it('when a parameter moves, every bar carries the stale flag of the result behind it', async () => {
    const service = setup();
    await settle(service.runWorstCase());

    service.setK(7);

    expect(service.severityBars().every((bar) => bar.stale)).toBe(true);
  });
});

// ===========================================================================
// Criterion — loading, failure and recovery
// ===========================================================================

describe('StressTestingService — lifecycle', () => {
  it('when a search is running, the page loads and names the action in flight', async () => {
    const service = setup();

    const work = service.runWorstCase();

    expect(service.state()).toBe('loading');
    expect(service.loading()).toBe(true);
    expect(service.pendingAction()).toBe('worst-case');

    await settle(work);

    expect(service.state()).toBe('ready');
    expect(service.pendingAction()).toBeNull();
  });

  it('when a manual evaluation is running, the action in flight is the manual one', async () => {
    const service = setup();
    service.setFactorFixed('equity', true);
    service.setFactorValue('equity', -18);

    const work = service.evaluateManual();
    expect(service.pendingAction()).toBe('manual');

    await settle(work);
    expect(service.pendingAction()).toBeNull();
  });

  it('when nothing is fixed, the manual evaluation does not pretend to run', async () => {
    const service = setup();

    const work = service.evaluateManual();
    expect(service.pendingAction()).toBeNull();

    await settle(work);

    expect(service.manualResult()).toBeNull();
    expect(service.state()).toBe('empty');
  });

  it('when the search fails, the error names the section it belongs above', async () => {
    const service = setup();

    await settle(service.runWorstCase(true));

    expect(service.state()).toBe('error');
    expect(service.error()?.section).toBe('worst-case');
    expect(service.error()?.message).toBeTruthy();
    expect(service.error()?.detail).toBeTruthy();
    expect(service.worstCaseResult()).toBeNull();
  });

  it('when a manual evaluation fails, the error is raised above the manual card', async () => {
    const service = setup();
    service.setFactorFixed('equity', true);
    service.setFactorValue('equity', -18);

    await settle(service.evaluateManual(true));

    expect(service.error()?.section).toBe('manual');
  });

  it('when the error is cleared, the page goes back to what it was showing', async () => {
    const service = setup();
    await settle(service.runWorstCase(true));

    service.clearError();

    expect(service.error()).toBeNull();
    expect(service.state()).toBe('empty');
  });

  it('when the search is retried after a failure, it recovers', async () => {
    const service = setup();
    await settle(service.runWorstCase(true));

    await settle(service.runWorstCase());

    expect(service.error()).toBeNull();
    expect(service.state()).toBe('ready');
    expect(service.worstCaseResult()!.maha).toBe(5);
  });

  it('when a search is already in flight, a second one is not started', async () => {
    const service = setup();

    const first = service.runWorstCase();
    const second = service.runWorstCase();
    await settle(first);
    await second;

    expect(service.worstCaseResult()).not.toBeNull();
    expect(service.pendingAction()).toBeNull();
  });
});
