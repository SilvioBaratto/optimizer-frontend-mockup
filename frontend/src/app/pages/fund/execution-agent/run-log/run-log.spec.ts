/**
 * The run trace. What is checked here is that it stays honest about *which*
 * run it describes: a failed snapshot read must not be allowed to pass the last
 * trace off as the current one, and an empty snapshot must not show a trace at
 * all.
 */

import { ComponentFixture, TestBed } from '@angular/core/testing';

import { ExecutionService } from '../../../../services/execution.service';
import { RunLog } from './run-log';

describe('RunLog', () => {
  let fixture: ComponentFixture<RunLog>;
  let host: HTMLElement;
  let service: ExecutionService;

  beforeEach(async () => {
    await TestBed.configureTestingModule({ imports: [RunLog] }).compileComponents();
    fixture = TestBed.createComponent(RunLog);
    host = fixture.nativeElement;
    service = TestBed.inject(ExecutionService);
    fixture.detectChanges();
  });

  function buttonLabelled(text: string): HTMLButtonElement {
    const match = Array.from(host.querySelectorAll('button')).find((b) =>
      (b.textContent ?? '').includes(text),
    );
    expect(match).toBeTruthy();
    return match as HTMLButtonElement;
  }

  it("when the last run is shown, every tool call carries the kind of tool it was", () => {
    const text = host.textContent ?? '';
    expect(text).toContain('get_market_data');
    expect(text).toContain('propose_orders');
    expect(text).toContain('read-only');
    expect(text).toContain('pure compute');
  });

  it('when the last run is shown, the reasoning excerpt is present', () => {
    expect(host.textContent).toContain('Sized turnover from target vs current weights');
  });

  it('when the trace has not been expanded, the full trace block is absent', () => {
    expect(host.querySelector('[data-testid="full-trace"]')).toBeNull();
    expect(buttonLabelled('View full trace').getAttribute('aria-expanded')).toBe('false');
  });

  it('when "View full trace" is activated, the full trace appears and aria-expanded flips', () => {
    buttonLabelled('View full trace').click();
    fixture.detectChanges();

    expect(host.querySelector('[data-testid="full-trace"]')).not.toBeNull();
    expect(buttonLabelled('View full trace').getAttribute('aria-expanded')).toBe('true');
  });

  it('when the full trace is open, it states that no tool can place an order', () => {
    buttonLabelled('View full trace').click();
    fixture.detectChanges();
    expect(host.querySelector('[data-testid="full-trace"]')?.textContent).toContain(
      'places an order',
    );
  });

  it('when a tool call is activated, it opens the full trace rather than doing nothing', () => {
    const entry = Array.from(host.querySelectorAll('li button')).find((b) =>
      b.textContent?.includes('get_market_data'),
    ) as HTMLButtonElement;
    expect(entry).toBeTruthy();

    entry.click();
    fixture.detectChanges();

    expect(host.querySelector('[data-testid="full-trace"]')).not.toBeNull();
  });

  it('when the trace toggle points at a region, that region is in the document', () => {
    const controls = buttonLabelled('View full trace').getAttribute('aria-controls');
    expect(controls).toBe('execution-run-trace');
    expect(host.querySelector('#execution-run-trace')).not.toBeNull();
  });

  it('when the snapshot read fails, the panel warns that the trace is not the current state', async () => {
    await service.refresh(true);
    fixture.detectChanges();

    const warning = host.querySelector('[data-testid="stale-trace-warning"]');
    expect(warning).not.toBeNull();
    expect(warning?.getAttribute('role')).toBe('status');
    expect(warning?.textContent).toContain('does not reflect the current fund state');
  });

  it('when no orders were proposed, the panel says so instead of showing a trace', async () => {
    service.snapshotHasOrders.set(false);
    await service.refresh();
    fixture.detectChanges();

    const text = host.textContent ?? '';
    expect(text).toContain('No run recorded');
    expect(text).not.toContain('get_market_data');
  });

  it('while the snapshot is being read, the panel is a skeleton rather than a stale list', async () => {
    const pending = service.refresh();
    fixture.detectChanges();

    const skeleton = host.querySelector('[data-testid="run-log-skeleton"]');
    expect(skeleton).not.toBeNull();
    expect(skeleton?.getAttribute('aria-busy')).toBe('true');

    await pending;
  });

  it('when Retry is activated, the snapshot is read again', async () => {
    await service.refresh(true);
    fixture.detectChanges();

    buttonLabelled('Retry').click();
    fixture.detectChanges();

    expect(host.querySelector('[data-testid="run-log-skeleton"]')).not.toBeNull();
    await new Promise((resolve) => setTimeout(resolve, 800));
  });
});
