import { ComponentFixture, TestBed } from '@angular/core/testing';

import { MODEL_INTERPRETATION_NOTE } from '../../../../models/risk-verdict.model';
import { RiskAgentService } from '../../../../services/risk-agent.service';
import { VerdictPanel } from './verdict-panel';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

async function setup(): Promise<ComponentFixture<VerdictPanel>> {
  await TestBed.configureTestingModule({ imports: [VerdictPanel] }).compileComponents();
  const fixture = TestBed.createComponent(VerdictPanel);
  fixture.detectChanges();
  return fixture;
}

function host(fixture: ComponentFixture<unknown>): HTMLElement {
  return fixture.nativeElement as HTMLElement;
}

function toggle(fixture: ComponentFixture<unknown>): HTMLButtonElement {
  return host(fixture).querySelector('[data-testid="raw-verdict-toggle"]')!;
}

function panel(fixture: ComponentFixture<unknown>): HTMLElement {
  return host(fixture).querySelector('#risk-raw-verdict')!;
}

function service(): RiskAgentService {
  return TestBed.inject(RiskAgentService);
}

// ===========================================================================
// Criterion — the verdict, and what the model contributed to it
// ===========================================================================

describe('VerdictPanel — the verdict', () => {
  it('when the panel renders, the verdict is a word beside its badge, never a colour alone', async () => {
    const fixture = await setup();
    expect(host(fixture).querySelector('[data-testid="verdict-badge"]')!.textContent).toContain(
      'FLAGGED',
    );
  });

  it('when the panel renders, the rationale is quoted as the model wrote it', async () => {
    const fixture = await setup();
    const quote = host(fixture).querySelector('[data-testid="verdict-rationale"]')!;

    expect(quote.tagName.toLowerCase()).toBe('blockquote');
    expect(quote.textContent).toContain('Tail severity elevated vs. prior run');
    expect(quote.textContent).toContain('“');
  });

  it('when the panel renders, each flagged driver is its own badge', async () => {
    const fixture = await setup();
    const text = host(fixture).textContent ?? '';

    expect(text).toContain('Sector concentration');
    expect(text).toContain('Tail asymmetry');
  });

  it('when a run flagged no driver, the panel says so rather than showing an empty row', async () => {
    const fixture = await setup();
    service().selectRun('1245');
    fixture.detectChanges();

    expect(host(fixture).textContent).toContain('none flagged');
  });

  it('when the panel renders, it states that the model never recomputes the numbers', async () => {
    const fixture = await setup();
    expect(host(fixture).textContent).toContain(MODEL_INTERPRETATION_NOTE);
  });
});

// ===========================================================================
// Criterion — the raw object, behind a disclosure
// ===========================================================================

describe('VerdictPanel — the raw disclosure', () => {
  it('when the panel first renders, the raw object is collapsed', async () => {
    const fixture = await setup();

    expect(toggle(fixture).getAttribute('aria-expanded')).toBe('false');
    expect(panel(fixture).hidden).toBe(true);
  });

  it('when the disclosure is opened, the raw object is revealed and the button says so', async () => {
    const fixture = await setup();
    toggle(fixture).click();
    fixture.detectChanges();

    expect(toggle(fixture).getAttribute('aria-expanded')).toBe('true');
    expect(panel(fixture).hidden).toBe(false);
    expect(panel(fixture).textContent).toContain('"verdict": "FLAGGED"');
  });

  it('when the disclosure is open, the button controls the panel it reveals', async () => {
    const fixture = await setup();
    expect(toggle(fixture).getAttribute('aria-controls')).toBe(panel(fixture).id);
  });

  it('when a display filter changes, the raw object written to the shared state does not', async () => {
    const fixture = await setup();
    toggle(fixture).click();
    fixture.detectChanges();
    const before = panel(fixture).textContent;

    service().method.set('historical');
    service().confidence.set(99);
    fixture.detectChanges();

    expect(panel(fixture).textContent).toBe(before);
  });

  it('when the raw object is shown, it holds every combination the tool computed', async () => {
    const fixture = await setup();
    toggle(fixture).click();
    fixture.detectChanges();
    const raw = panel(fixture).textContent ?? '';

    expect(raw).toContain('riskmetrics');
    expect(raw).toContain('historical');
    expect(raw).toContain('"95"');
    expect(raw).toContain('"99"');
  });
});
