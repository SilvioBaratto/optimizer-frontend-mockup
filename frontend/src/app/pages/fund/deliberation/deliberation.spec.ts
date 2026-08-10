/**
 * The Fund Deliberation page, as the destination of an audit reference.
 *
 * Every «Fund Deliberation · run #1247» in the decision log points here, so the
 * question these tests ask is whether arriving actually settles anything: does
 * the page say which run it is showing, and when the link named a different
 * run, does it say that too rather than letting the reader assume they are
 * looking at what they asked for.
 *
 * The page holds one run's checkpoints and no more. The honest answer for a
 * superseded run is that its checkpoints are not loaded here — not two more
 * runs of invented frozen state under an audit trail.
 */

import { ComponentFixture, TestBed } from '@angular/core/testing';
import { ActivatedRoute, provideRouter } from '@angular/router';

import { DeliberationService } from '../../../services/deliberation.service';
import { RiskAgentService } from '../../../services/risk-agent.service';
import { Deliberation } from './deliberation';

interface Rendered {
  fixture: ComponentFixture<Deliberation>;
  host: HTMLElement;
  service: DeliberationService;
}

const mounted: HTMLElement[] = [];

/**
 * Renders the page as though it had been entered on `…/deliberation?run=<id>`.
 *
 * The run to ask for is chosen from the live service rather than written out
 * here, so these tests check the page against the run it really holds. The
 * parameter is patched onto the route snapshot before the first render, which
 * is the only moment the page reads it — the same entry-condition contract
 * doc 16's `trade` deep link uses.
 */
async function render(
  runFor: (service: DeliberationService) => string | null,
): Promise<Rendered> {
  await TestBed.configureTestingModule({
    imports: [Deliberation],
    providers: [provideRouter([])],
  }).compileComponents();

  const service = TestBed.inject(DeliberationService);
  const run = runFor(service);
  const route = TestBed.inject(ActivatedRoute);
  (route.snapshot as unknown as { queryParams: Record<string, string> }).queryParams =
    run === null ? {} : { run };

  const fixture = TestBed.createComponent(Deliberation);
  const host: HTMLElement = fixture.nativeElement;
  // Attached to the document, because "does the notice take focus" is only a
  // real question for an element that is actually in the page.
  document.body.appendChild(host);
  mounted.push(host);
  fixture.detectChanges();
  return { fixture, host, service };
}

function byTestId(host: HTMLElement, id: string): HTMLElement | null {
  return host.querySelector(`[data-testid="${id}"]`);
}

/** The retained run that is not the one loaded here — #1246 or #1245. */
function otherRetainedRun(service: DeliberationService): string {
  const other = service.retainedRunIds().find((id) => id !== service.runId());
  if (!other) throw new Error('the fixture needs a second retained run');
  return other;
}

describe('Deliberation page — the run it is showing', () => {
  afterEach(() => {
    while (mounted.length) mounted.pop()?.remove();
  });

  it('when the deliberation page loads without a run parameter, it names the run it is showing', async () => {
    const { host, service } = await render(() => null);

    expect(byTestId(host, 'run-id')?.textContent).toContain(`#${service.runId()}`);
    expect(byTestId(host, 'run-mismatch')).toBeNull();
  });

  it('when the run parameter matches the loaded run, no mismatch notice appears', async () => {
    const { host, service } = await render((s) => s.runId());

    expect(byTestId(host, 'run-mismatch')).toBeNull();
    expect(byTestId(host, 'run-id')?.textContent).toContain(`#${service.runId()}`);
  });

  it('when the run parameter names a different retained run, the notice appears, names both runs, and offers the way back to the audit log', async () => {
    const { host, service } = await render(otherRetainedRun);
    const requested = otherRetainedRun(service);

    const notice = byTestId(host, 'run-mismatch');
    expect(notice).not.toBeNull();
    // Both ids: what the reader asked for, and what they are actually looking
    // at. Naming only one of the two is how the silence started.
    expect(notice?.textContent).toContain(`#${requested}`);
    expect(notice?.textContent).toContain(`#${service.runId()}`);
    expect(notice?.textContent).toContain('retained in the audit log');
    expect(notice?.textContent).toContain('checkpoints are not loaded here');
    expect(byTestId(host, 'run-mismatch-audit-link')?.getAttribute('href')).toBe('/report');
  });

  it('when a different run is requested, the notice is announced politely and takes no focus', async () => {
    const { fixture, host } = await render(otherRetainedRun);
    await fixture.whenStable();

    // status, not alert: nothing has failed and nothing needs doing.
    expect(byTestId(host, 'run-mismatch')?.getAttribute('role')).toBe('status');
    expect(host.contains(document.activeElement)).toBe(false);
  });

  it('when the run parameter names a run nothing retains, the notice says so instead of claiming it is in the log', async () => {
    const { host, service } = await render(() => '9999');

    // The premise of the test, stated against the service rather than assumed:
    // if #9999 were ever retained this would be checking the other branch.
    expect([...service.retainedRunIds()]).not.toContain('9999');

    const notice = byTestId(host, 'run-mismatch');
    expect(notice?.textContent).toContain('#9999');
    expect(notice?.textContent).toContain('no longer exists anywhere in this app');
    expect(notice?.textContent).not.toContain('retained in the audit log');
  });
});

describe('DeliberationService — run identity', () => {
  it('when the deliberation service reports its run, it is the run RiskAgentService calls its latest', () => {
    const deliberation = TestBed.inject(DeliberationService);
    const risk = TestBed.inject(RiskAgentService);

    const latest = risk.runs().find((run) => run.latest);
    expect(latest).toBeDefined();
    expect(deliberation.runId()).toBe(latest?.id);
  });

  it('when the retained runs are listed, they are the runs RiskAgentService still holds', () => {
    const deliberation = TestBed.inject(DeliberationService);
    const risk = TestBed.inject(RiskAgentService);

    expect([...deliberation.retainedRunIds()]).toEqual(risk.runs().map((run) => run.id));
  });
});
