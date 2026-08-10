import { ComponentFixture, TestBed } from '@angular/core/testing';

import { TOOL_CALL_KIND } from '../../../../models/risk-verdict.model';
import { ToolCallLog } from './tool-call-log';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

async function setup(): Promise<ComponentFixture<ToolCallLog>> {
  await TestBed.configureTestingModule({ imports: [ToolCallLog] }).compileComponents();
  const fixture = TestBed.createComponent(ToolCallLog);
  fixture.detectChanges();
  return fixture;
}

function host(fixture: ComponentFixture<unknown>): HTMLElement {
  return fixture.nativeElement as HTMLElement;
}

function toggle(fixture: ComponentFixture<unknown>): HTMLButtonElement {
  return host(fixture).querySelector('[data-testid="tool-call-log-toggle"]')!;
}

function panel(fixture: ComponentFixture<unknown>): HTMLElement {
  return host(fixture).querySelector('#risk-tool-call-log')!;
}

function rows(fixture: ComponentFixture<unknown>): HTMLTableRowElement[] {
  return Array.from(host(fixture).querySelectorAll('tbody tr'));
}

// ===========================================================================
// Criterion — a secondary panel, collapsed by default
// ===========================================================================

describe('ToolCallLog — the disclosure', () => {
  it('when the card first renders, the log is collapsed', async () => {
    const fixture = await setup();

    expect(toggle(fixture).getAttribute('aria-expanded')).toBe('false');
    expect(panel(fixture).hidden).toBe(true);
  });

  it('when the toggle is pressed, the log opens and the button offers to close it', async () => {
    const fixture = await setup();
    toggle(fixture).click();
    fixture.detectChanges();

    expect(toggle(fixture).getAttribute('aria-expanded')).toBe('true');
    expect(panel(fixture).hidden).toBe(false);
    expect(toggle(fixture).textContent).toContain('Collapse tool call log');
  });

  it('when the toggle is pressed, it names the panel it controls', async () => {
    const fixture = await setup();
    expect(toggle(fixture).getAttribute('aria-controls')).toBe(panel(fixture).id);
  });
});

// ===========================================================================
// Criterion — the audit table
// ===========================================================================

describe('ToolCallLog — the table', () => {
  it('when the log is open, every tool call of the run is a row', async () => {
    const fixture = await setup();
    toggle(fixture).click();
    fixture.detectChanges();

    expect(rows(fixture)).toHaveLength(2);
    expect(rows(fixture)[1].textContent).toContain('portopt');
  });

  it('when the log is open, the table is described for a screen reader', async () => {
    const fixture = await setup();
    const caption = host(fixture).querySelector('caption')!;

    expect(caption.classList.contains('sr-only')).toBe(true);
    expect(caption.textContent).toContain('risk agent');
  });

  it('when the log is open, every call is read-only or pure-compute', async () => {
    const fixture = await setup();
    toggle(fixture).click();
    fixture.detectChanges();

    for (const row of rows(fixture)) {
      expect(row.textContent).toContain(TOOL_CALL_KIND);
    }
  });

  it('when the log is open, each row states its UTC time, duration and outcome in words', async () => {
    const fixture = await setup();
    toggle(fixture).click();
    fixture.detectChanges();

    const portopt = rows(fixture)[1];
    expect(portopt.textContent).toContain('09:14:02 UTC');
    expect(portopt.textContent).toContain('0.42s');
    expect(portopt.textContent).toContain('success');
  });

  it('when the log is open, the row header is the time and numbers are right-aligned', async () => {
    const fixture = await setup();
    toggle(fixture).click();
    fixture.detectChanges();

    const header = rows(fixture)[0].querySelector('th')!;
    expect(header.getAttribute('scope')).toBe('row');

    const duration = rows(fixture)[0].querySelectorAll('td')[2];
    expect(duration.className).toContain('text-right');
    expect(duration.className).toContain('tabular-nums');
  });
});
