/**
 * The decision detail panel.
 *
 * The audit-by-inspection surface, so the tests are about what it shows and
 * what it refuses to claim: the *full* output rather than a preview, the
 * parameters as they were logged, and a prompt hash that says plainly whether
 * it was recorded — without either state reading as a fault.
 *
 * The rest is the dialog contract the spec makes normative: role, modality,
 * focus onto the heading on opening, and focus back to the row that opened it
 * on both ways out.
 */

import { ComponentFixture, TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';

import { ExecutionService } from '../../../services/execution.service';
import { ReportAuditService } from '../../../services/report-audit.service';
import { DecisionTable } from '../decision-table/decision-table';
import { DecisionDetail } from './decision-detail';

describe('DecisionDetail', () => {
  let fixture: ComponentFixture<DecisionDetail>;
  let host: HTMLElement;
  let service: ReportAuditService;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [DecisionDetail],
      providers: [provideRouter([])],
    }).compileComponents();
    fixture = TestBed.createComponent(DecisionDetail);
    host = fixture.nativeElement;
    // Attached to the document: focus, Escape and the focus trap are only real
    // for an element that is actually in the page.
    document.body.appendChild(host);
    service = TestBed.inject(ReportAuditService);
    fixture.detectChanges();
  });

  afterEach(() => host.remove());

  function open(index = 0): void {
    service.select(service.decisions()[index].id);
    fixture.detectChanges();
  }

  function openWithHash(): void {
    const hashed = service.decisions().find((d) => d.promptHash !== null)!;
    service.select(hashed.id);
    fixture.detectChanges();
  }

  function dialog(): HTMLElement | null {
    return host.querySelector('[role="dialog"]');
  }

  function byTestId(id: string): HTMLElement | null {
    return host.querySelector(`[data-testid="${id}"]`);
  }

  // --- the dialog contract --------------------------------------------------

  it('when nothing is selected, no dialog is in the page', () => {
    expect(dialog()).toBeNull();
  });

  it('when a decision is opened, the panel is a modal dialog naming the decision', () => {
    open();

    expect(dialog()?.getAttribute('aria-modal')).toBe('true');
    expect(dialog()?.getAttribute('aria-label')).toContain(service.decisions()[0].id);
  });

  it('when the panel opens, focus lands on its heading rather than on a control', async () => {
    open();
    await fixture.whenStable();

    expect(document.activeElement).toBe(byTestId('detail-heading'));
    expect(byTestId('detail-heading')?.getAttribute('tabindex')).toBe('-1');
  });

  it('when the close button is used, focus returns to the row that opened the panel', async () => {
    const table = TestBed.createComponent(DecisionTable);
    document.body.appendChild(table.nativeElement);
    table.detectChanges();
    const row = table.nativeElement.querySelector('[data-decision-row]') as HTMLButtonElement;
    row.focus();
    row.click();
    table.detectChanges();
    fixture.detectChanges();
    await fixture.whenStable();

    (byTestId('detail-close') as HTMLButtonElement).click();
    fixture.detectChanges();

    expect(document.activeElement).toBe(row);
    table.nativeElement.remove();
  });

  it('when Escape is pressed, the panel closes and focus goes back to the opener', async () => {
    const table = TestBed.createComponent(DecisionTable);
    document.body.appendChild(table.nativeElement);
    table.detectChanges();
    const row = table.nativeElement.querySelector('[data-decision-row]') as HTMLButtonElement;
    row.focus();
    row.click();
    table.detectChanges();
    fixture.detectChanges();
    await fixture.whenStable();

    document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
    fixture.detectChanges();

    expect(dialog()).toBeNull();
    expect(service.selectedDecision()).toBeNull();
    expect(document.activeElement).toBe(row);
    table.nativeElement.remove();
  });

  // --- what the panel shows -------------------------------------------------

  it('when a decision is opened, its model and full parameter set are shown', () => {
    open();
    const decision = service.decisions()[0];

    expect(host.textContent).toContain(decision.model);
    for (const param of decision.params) {
      expect(byTestId('detail-params')?.textContent).toContain(`${param.name}=${param.value}`);
    }
  });

  it('when a decision is opened, the whole output is shown and not a preview', () => {
    open();
    const decision = service.decisions()[0];

    const paragraphs = Array.from(
      byTestId('detail-output')?.querySelectorAll('p') ?? [],
    ).map((p) => p.textContent?.trim());

    expect(paragraphs).toEqual(decision.output.map((line) => line));
  });

  it('when the output is longer than the panel, it scrolls inside its own box', () => {
    open();

    expect(byTestId('detail-output')?.className).toContain('overflow-y-auto');
  });

  // --- the prompt hash ------------------------------------------------------

  it('when the decision has no prompt hash, the panel says not logged and why', () => {
    const unhashed = service.decisions().find((d) => d.promptHash === null)!;
    service.select(unhashed.id);
    fixture.detectChanges();

    const cell = byTestId('detail-hash');
    expect(cell?.querySelector('.sr-only')?.textContent).toBe('not logged');
    expect(cell?.textContent).toContain('reproducibility is not guaranteed');
    expect(cell?.className).not.toContain('text-danger');
  });

  it('when the decision does have a prompt hash, the panel still refuses to promise a replay', () => {
    openWithHash();
    const hashed = service.decisions().find((d) => d.promptHash !== null)!;

    const cell = byTestId('detail-hash');
    expect(cell?.textContent).toContain(hashed.promptHash as string);
    expect(cell?.textContent).toContain('bit-exact replay still depends on the model');
  });

  // --- copy -----------------------------------------------------------------

  it('when Copy is used, the whole output reaches the clipboard', async () => {
    open();
    const written: string[] = [];
    Object.defineProperty(navigator, 'clipboard', {
      configurable: true,
      value: {
        writeText: (text: string) => {
          written.push(text);
          return Promise.resolve();
        },
      },
    });

    (byTestId('detail-copy') as HTMLButtonElement).click();
    await fixture.whenStable();
    fixture.detectChanges();

    expect(written).toEqual([service.decisions()[0].output.join('\n\n')]);
    expect(host.textContent).toContain('Full output copied to the clipboard.');
  });

  // --- related --------------------------------------------------------------

  it('when a decision is opened, Related names the deliberation run it belongs to', () => {
    open();
    const decision = service.decisions()[0];

    expect(byTestId('detail-run-link')?.textContent).toContain(`run #${decision.runId}`);
  });

  it('when a decision is opened, its Related link carries the run id of that decision', () => {
    open();
    const decision = service.decisions()[0];

    expect(byTestId('detail-run-link')?.getAttribute('href')).toBe(
      `/fund/deliberation?run=${decision.runId}`,
    );
  });

  /*
    Naming the run is not enough on its own: the destination can only confirm
    or deny a reference it was actually given, so the id has to survive the
    hop for *every* row, including the superseded runs whose checkpoints the
    deliberation page does not hold.
  */
  it('when a decision from a superseded run is opened, its Related link carries that run and not the latest', () => {
    const latest = service.decisions()[0].runId;
    const superseded = service.decisions().find((d) => d.runId !== latest)!;
    service.select(superseded.id);
    fixture.detectChanges();

    expect(byTestId('detail-run-link')?.getAttribute('href')).toBe(
      `/fund/deliberation?run=${superseded.runId}`,
    );
  });

  it('when the decision drafted a trade, Related reaches that trade at the gate', () => {
    const queued = TestBed.inject(ExecutionService).orders();
    const drafted = service
      .decisions()
      .find((d) => d.tradeId !== null && queued.some((o) => o.id === d.tradeId))!;
    service.select(drafted.id);
    fixture.detectChanges();

    const link = byTestId('detail-gate-link');
    expect(link?.getAttribute('href')).toBe(
      `/approvals/approval-gate?trade=${drafted.tradeId}`,
    );
  });

  /*
    The execution agent holds one snapshot and the log retains three runs, so a
    superseded run's trade id resolves nowhere. The gate reads its `trade`
    parameter once and treats an unknown id as a no-op, which means a link here
    would land the reader on the queue with nothing selected — an audit
    reference that looks satisfied and shows them nothing.
  */
  it('when the trade a decision drafted is no longer in the snapshot, the gate row says so instead of linking to it', () => {
    const queued = TestBed.inject(ExecutionService).orders();
    const superseded = service
      .decisions()
      .find((d) => d.tradeId !== null && !queued.some((o) => o.id === d.tradeId))!;
    service.select(superseded.id);
    fixture.detectChanges();

    expect(byTestId('detail-gate-link')).toBeNull();
    const row = byTestId('detail-gate-superseded');
    expect(row?.textContent).toContain(superseded.tradeId as string);
    expect(row?.textContent).toContain(`run #${superseded.runId}`);
    expect(row?.textContent).toContain('no order under that id is queued');
  });

  it('when the decision drafted nothing, the gate row says so instead of linking nowhere', () => {
    const undrafted = service.decisions().find((d) => d.tradeId === null)!;
    service.select(undrafted.id);
    fixture.detectChanges();

    expect(byTestId('detail-gate-link')).toBeNull();
    expect(host.textContent).toContain('this decision drafted no order');
  });
});
