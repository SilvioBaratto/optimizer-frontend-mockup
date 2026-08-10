import { ComponentFixture, TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';

import { RiskAgentService } from '../../../services/risk-agent.service';
import { RiskAgent } from './risk-agent';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

async function setup(): Promise<ComponentFixture<RiskAgent>> {
  await TestBed.configureTestingModule({
    imports: [RiskAgent],
    providers: [provideRouter([])],
  }).compileComponents();

  const fixture = TestBed.createComponent(RiskAgent);
  fixture.detectChanges();
  return fixture;
}

function host(fixture: ComponentFixture<unknown>): HTMLElement {
  return fixture.nativeElement as HTMLElement;
}

function text(fixture: ComponentFixture<unknown>): string {
  return host(fixture).textContent ?? '';
}

function runButton(fixture: ComponentFixture<unknown>): HTMLButtonElement {
  return host(fixture).querySelector('app-run-selector button')!;
}

/** Every region the wireframe names, in the order it draws them. */
const REGIONS: readonly string[] = [
  'app-page-context-bar',
  'app-run-selector',
  'app-upstream-inputs',
  'app-calculation-trace',
  'app-measure-filters',
  'app-risk-measures',
  'app-verdict-panel',
  'app-tool-call-log',
  'app-action-button-row',
];

// ===========================================================================
// Criterion — the page renders every region of the wireframe, in order
// ===========================================================================

describe('RiskAgent — regions', () => {
  for (const selector of REGIONS) {
    it(`when the page renders, the ${selector} region is present`, async () => {
      const fixture = await setup();
      expect(host(fixture).querySelector(selector)).toBeTruthy();
    });
  }

  it('when the page renders, the regions appear in wireframe order', async () => {
    const fixture = await setup();
    const found = Array.from(host(fixture).querySelectorAll(REGIONS.join(',')));
    expect(found.map((el) => el.tagName.toLowerCase())).toEqual([...REGIONS]);
  });

  it('when the page renders, no heading above <h2> is emitted — the shell owns the h1', async () => {
    const fixture = await setup();
    expect(host(fixture).querySelectorAll('h1')).toHaveLength(0);
    expect(host(fixture).querySelectorAll('h2').length).toBeGreaterThan(0);
  });
});

// ===========================================================================
// Criterion — the breadcrumb states what is read, what is written and the run
// ===========================================================================

describe('RiskAgent — context bar', () => {
  it('when the page renders, the context bar names both fields read and the field written', async () => {
    const fixture = await setup();
    const bar = host(fixture).querySelector('app-page-context-bar')!;
    expect(bar.textContent).toContain('reads state.allocation + state.macro_view');
    expect(bar.textContent).toContain('writes state.risk_verdict');
  });

  it('when the page renders, the run status is a word, not only a colour', async () => {
    const fixture = await setup();
    const bar = host(fixture).querySelector('app-page-context-bar')!;
    expect(bar.textContent).toContain('Done');
  });

  it('when the page renders, the context bar carries the run number and its UTC stamp', async () => {
    const fixture = await setup();
    expect(host(fixture).querySelector('[data-testid="context-run"]')!.textContent).toContain(
      'run #1247',
    );
    expect(host(fixture).querySelector('[data-testid="context-stamp"]')!.textContent).toContain(
      '2026-08-01 09:14 UTC',
    );
  });
});

// ===========================================================================
// Criterion — empty state
// ===========================================================================

describe('RiskAgent — empty state', () => {
  it('when state.allocation is missing, the assessment regions are replaced by an empty state', async () => {
    const fixture = await setup();
    TestBed.inject(RiskAgentService).readFundState(null, null);
    fixture.detectChanges();

    expect(host(fixture).querySelector('app-empty-state')).toBeTruthy();
    expect(host(fixture).querySelector('app-risk-measures')).toBeNull();
    expect(host(fixture).querySelector('app-verdict-panel')).toBeNull();
  });

  it('when state.allocation is missing, the empty state explains why and links to the Allocation Agent', async () => {
    const fixture = await setup();
    TestBed.inject(RiskAgentService).readFundState(null, null);
    fixture.detectChanges();

    const empty = host(fixture).querySelector('app-empty-state')!;
    expect(empty.textContent).toContain('state.allocation has not been written yet');
    expect(empty.querySelector('a')!.getAttribute('href')).toBe('/fund/allocation-agent');
  });

  /*
    The spec names two causes for the empty state and gives them different next
    steps: the input has not been written, or the agent has not run. Collapsing
    them into one message loses the only thing the reader needs — which of the
    two it is.
  */
  it('when no run has been recorded, the empty state names that cause, not the missing input', async () => {
    const fixture = await setup();
    TestBed.inject(RiskAgentService).clearRuns();
    fixture.detectChanges();

    const empty = host(fixture).querySelector('app-empty-state')!;
    expect(empty.textContent).toContain('No run of the risk agent has been recorded');
    expect(empty.textContent).not.toContain('state.allocation has not been written yet');
  });

  it('when no run has been recorded, running the assessment fills the page in', async () => {
    vi.useFakeTimers();
    try {
      const fixture = await setup();
      TestBed.inject(RiskAgentService).clearRuns();
      fixture.detectChanges();
      expect(host(fixture).querySelectorAll('[data-measure]')).toHaveLength(0);

      runButton(fixture).click();
      await vi.advanceTimersByTimeAsync(5_000);
      fixture.detectChanges();

      expect(host(fixture).querySelector('app-empty-state')).toBeNull();
      expect(host(fixture).querySelectorAll('[data-measure]')).toHaveLength(5);
    } finally {
      vi.useRealTimers();
    }
  });

  it('when state.allocation is missing, the trust boundary and the exits still render', async () => {
    const fixture = await setup();
    TestBed.inject(RiskAgentService).readFundState(null, null);
    fixture.detectChanges();

    expect(text(fixture)).toContain('read-only or pure-compute, fixed at build time');
    expect(host(fixture).querySelector('app-action-button-row')).toBeTruthy();
  });
});

// ===========================================================================
// Criterion — loading state
// ===========================================================================

describe('RiskAgent — loading state', () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('when an assessment is running, the measure cards are skeletons and no value is shown', async () => {
    const fixture = await setup();
    expect(host(fixture).querySelectorAll('[data-measure]').length).toBe(5);

    runButton(fixture).click();
    fixture.detectChanges();

    expect(host(fixture).querySelectorAll('[data-measure]').length).toBe(0);
    expect(host(fixture).querySelectorAll('app-skeleton-block').length).toBeGreaterThan(0);
    expect(
      host(fixture)
        .querySelector('app-risk-measures app-section-card-grid')!
        .getAttribute('aria-busy'),
    ).toBe('true');

    await vi.advanceTimersByTimeAsync(5_000);
  });

  it('when an assessment is running, the calculation card says which tool is running', async () => {
    const fixture = await setup();
    runButton(fixture).click();
    fixture.detectChanges();

    expect(
      host(fixture).querySelector('[data-testid="calculation-running"]')!.textContent,
    ).toContain('Running portopt…');

    await vi.advanceTimersByTimeAsync(5_000);
  });

  it('when an assessment is running, the run button is disabled', async () => {
    const fixture = await setup();
    expect(runButton(fixture).disabled).toBe(false);

    runButton(fixture).click();
    fixture.detectChanges();

    expect(runButton(fixture).disabled).toBe(true);

    await vi.advanceTimersByTimeAsync(5_000);
    fixture.detectChanges();
    expect(runButton(fixture).disabled).toBe(false);
  });
});

// ===========================================================================
// Criterion — error state names the phase that failed
// ===========================================================================

describe('RiskAgent — error state', () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('when the deterministic calculation fails, the alert names the calculation phase', async () => {
    const fixture = await setup();
    const pending = TestBed.inject(RiskAgentService).recompute('calculation');
    await vi.advanceTimersByTimeAsync(5_000);
    await pending;
    fixture.detectChanges();

    const alert = host(fixture).querySelector('[role="alert"]')!;
    expect(alert.textContent).toContain('Deterministic risk calculation');
    expect(alert.textContent).not.toContain('Model interpretation');
  });

  it('when the model interpretation fails, the alert names the interpretation phase', async () => {
    const fixture = await setup();
    const pending = TestBed.inject(RiskAgentService).recompute('interpretation');
    await vi.advanceTimersByTimeAsync(5_000);
    await pending;
    fixture.detectChanges();

    const alert = host(fixture).querySelector('[role="alert"]')!;
    expect(alert.textContent).toContain('Model interpretation');
    expect(alert.textContent).not.toContain('Deterministic risk calculation');
  });

  it('when a failure is retried, the alert clears and the measures come back', async () => {
    const fixture = await setup();
    const service = TestBed.inject(RiskAgentService);
    const pending = service.recompute('calculation');
    await vi.advanceTimersByTimeAsync(5_000);
    await pending;
    fixture.detectChanges();

    const retry: HTMLButtonElement = host(fixture).querySelector('[role="alert"] button')!;
    retry.click();
    await vi.advanceTimersByTimeAsync(5_000);
    fixture.detectChanges();

    expect(host(fixture).querySelector('[role="alert"]')).toBeNull();
    expect(host(fixture).querySelectorAll('[data-measure]').length).toBe(5);
  });

  /*
    Retry destroys the alert it lives in, so without a handoff focus lands on
    `<body>` and the next Tab restarts at the top of the document.
  */
  it('when a failure is retried, focus moves into the run card instead of being dropped', async () => {
    const fixture = await setup();
    const pending = TestBed.inject(RiskAgentService).recompute('calculation');
    await vi.advanceTimersByTimeAsync(5_000);
    await pending;
    fixture.detectChanges();

    const retry: HTMLButtonElement = host(fixture).querySelector('[role="alert"] button')!;
    retry.focus();
    expect(document.activeElement).toBe(retry);

    retry.click();
    fixture.detectChanges();

    expect(document.activeElement).not.toBe(document.body);
    expect(document.activeElement).toBe(host(fixture).querySelector('#risk-run-picker'));

    await vi.advanceTimersByTimeAsync(5_000);
  });
});

// ===========================================================================
// Criterion — no side-effecting action is reachable from this page
// ===========================================================================

describe('RiskAgent — trust boundary', () => {
  it('when the page renders, the trust boundary states both of its rules', async () => {
    const fixture = await setup();
    expect(text(fixture)).toContain(
      'Tools available to this agent are read-only or pure-compute, fixed at build time',
    );
    expect(text(fixture)).toContain('No order-placing or spending action is reachable from this page');
  });

  it('when the page renders, both exits lead to a human-gated page', async () => {
    const fixture = await setup();
    const links = Array.from(
      host(fixture).querySelectorAll<HTMLAnchorElement>('app-action-button-row a'),
    );
    expect(links.map((a) => a.getAttribute('href'))).toEqual([
      '/approvals/approval-gate',
      '/approvals/guardrail-killswitch',
    ]);
  });

  it('when the page renders, the only writable controls are the run picker and the display filters', async () => {
    const fixture = await setup();
    const root = host(fixture);

    // No free text, no numeric entry, no checkbox: nothing here edits state.
    expect(root.querySelectorAll('input, textarea')).toHaveLength(0);
    // One select, and it only chooses which past run is displayed.
    const selects = Array.from(root.querySelectorAll('select'));
    expect(selects.map((s) => s.id)).toEqual(['risk-run-picker']);
  });
});
