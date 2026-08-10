import { ComponentFixture, TestBed } from '@angular/core/testing';

import { RUNNING_TOOL_LABEL, type FundStateInput } from '../../../../models/risk-verdict.model';
import { RiskAgentService } from '../../../../services/risk-agent.service';
import { RunSelector } from './run-selector';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

async function setup(): Promise<ComponentFixture<RunSelector>> {
  await TestBed.configureTestingModule({ imports: [RunSelector] }).compileComponents();
  const fixture = TestBed.createComponent(RunSelector);
  fixture.detectChanges();
  return fixture;
}

function host(fixture: ComponentFixture<unknown>): HTMLElement {
  return fixture.nativeElement as HTMLElement;
}

function button(fixture: ComponentFixture<unknown>): HTMLButtonElement {
  return host(fixture).querySelector('button')!;
}

function picker(fixture: ComponentFixture<unknown>): HTMLSelectElement {
  return host(fixture).querySelector('select')!;
}

function live(fixture: ComponentFixture<unknown>): HTMLElement {
  return host(fixture).querySelector('[aria-live="polite"]')!;
}

function service(): RiskAgentService {
  return TestBed.inject(RiskAgentService);
}

function choose(select: HTMLSelectElement, value: string): void {
  select.value = value;
  select.dispatchEvent(new Event('change', { bubbles: true }));
}

const MACRO: FundStateInput = {
  field: 'macro_view',
  writtenBy: 'Macro & Regimes Agent',
  at: '2026-08-01T08:55:00Z',
  summary: 'Bull 62% · six asset-class views',
  positionCount: null,
  route: '/fund/macro-agent',
  linkLabel: 'Open in Macro & Regimes',
};

// ===========================================================================
// Criterion — the run picker inspects history without recomputing
// ===========================================================================

describe('RunSelector — run picker', () => {
  it('when the card renders, the picker lists every past run with the latest selected', async () => {
    const fixture = await setup();
    const options = Array.from(picker(fixture).options);

    expect(options).toHaveLength(3);
    expect(options[0].textContent).toContain('Latest run');
    expect(picker(fixture).value).toBe('1247');
  });

  it('when an older run is picked, the view moves to it without starting a computation', async () => {
    const fixture = await setup();
    const spy = vi.spyOn(service(), 'recompute');

    choose(picker(fixture), '1246');
    fixture.detectChanges();

    expect(service().selectedRunId()).toBe('1246');
    expect(spy).not.toHaveBeenCalled();
  });

  it('when an older run is picked, the card warns that the allocation may have been replaced', async () => {
    const fixture = await setup();
    expect(host(fixture).querySelector('[data-testid="historical-run-note"]')).toBeNull();

    choose(picker(fixture), '1245');
    fixture.detectChanges();

    const note = host(fixture).querySelector('[data-testid="historical-run-note"]')!;
    expect(note.textContent).toContain('state.allocation may have been replaced');
  });

  it('when an older run is picked, the warning is described from the picker itself', async () => {
    const fixture = await setup();
    expect(picker(fixture).getAttribute('aria-describedby')).toBeNull();

    choose(picker(fixture), '1245');
    fixture.detectChanges();

    const id = picker(fixture).getAttribute('aria-describedby');
    expect(id).toBeTruthy();
    expect(host(fixture).querySelector(`#${id}`)!.textContent).toContain(
      'state.allocation may have been replaced',
    );
  });

  it('when no run has been recorded, the picker is replaced by a line saying so', async () => {
    const fixture = await setup();
    service().clearRuns();
    fixture.detectChanges();

    expect(host(fixture).querySelector('select')).toBeNull();
    expect(host(fixture).querySelector('[data-testid="no-run-note"]')!.textContent).toContain(
      'No run has been recorded',
    );
    // The allocation is still there, so the assessment can still be started.
    expect(button(fixture).disabled).toBe(false);
  });

  /*
    The spec fixes the tab sequence as EntityPicker, then RunButton. Rendering
    the button through `HeroStatCard`'s `[hero-action]` slot puts it in the card
    header — ahead of the projected body that holds the picker — which reverses
    exactly this order.
  */
  it('when the card renders, the picker comes before the run button in the tab sequence', async () => {
    const fixture = await setup();
    const order = Array.from(host(fixture).querySelectorAll('select, button'));

    expect(order.map((el) => el.tagName.toLowerCase())).toEqual(['select', 'button']);
    expect(
      picker(fixture).compareDocumentPosition(button(fixture)) &
        Node.DOCUMENT_POSITION_FOLLOWING,
    ).toBeTruthy();
  });
});

// ===========================================================================
// Criterion — the run button states why it is unavailable
// ===========================================================================

describe('RunSelector — the run button', () => {
  it('when state.allocation is present, the button is enabled and carries no description', async () => {
    const fixture = await setup();

    expect(button(fixture).disabled).toBe(false);
    expect(button(fixture).getAttribute('aria-describedby')).toBeNull();
  });

  it('when state.allocation is missing, the button is disabled and describes the reason', async () => {
    const fixture = await setup();
    service().readFundState(null, MACRO);
    fixture.detectChanges();

    const reasonId = button(fixture).getAttribute('aria-describedby');
    expect(button(fixture).disabled).toBe(true);
    expect(reasonId).toBeTruthy();

    // The reason is real text on the page, not only a tooltip.
    const reason = host(fixture).querySelector(`#${reasonId}`);
    expect(reason).toBeTruthy();
    expect(reason!.textContent).toContain('state.allocation is missing');
    expect(reason!.classList.contains('sr-only')).toBe(false);
  });
});

// ===========================================================================
// Criterion — progress and completion are announced politely
// ===========================================================================

describe('RunSelector — announcements', () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('when the card first renders, the live region is already mounted and empty', async () => {
    const fixture = await setup();

    expect(live(fixture)).toBeTruthy();
    expect((live(fixture).textContent ?? '').trim()).toBe('');
  });

  it('when the assessment starts, the live region names the tool that is running', async () => {
    const fixture = await setup();

    button(fixture).click();
    fixture.detectChanges();

    expect(live(fixture).textContent).toContain(RUNNING_TOOL_LABEL);

    await vi.advanceTimersByTimeAsync(5_000);
  });

  it('when the assessment completes, the live region announces the verdict', async () => {
    const fixture = await setup();

    button(fixture).click();
    await vi.advanceTimersByTimeAsync(5_000);
    fixture.detectChanges();

    expect(live(fixture).textContent).toContain('Risk assessment complete');
    expect(live(fixture).textContent).toContain('FLAGGED');
  });

  it('when the assessment fails, the live region announces the phase that failed', async () => {
    const fixture = await setup();
    const original = service().recompute.bind(service());
    vi.spyOn(service(), 'recompute').mockImplementation(() => original('interpretation'));

    button(fixture).click();
    await vi.advanceTimersByTimeAsync(5_000);
    fixture.detectChanges();

    expect(live(fixture).textContent).toContain('Model interpretation');
  });
});
