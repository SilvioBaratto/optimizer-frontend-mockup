import { ComponentFixture, TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';

import {
  CONSUMED_NOTE,
  MACRO_STALE_NOTE,
  type FundStateInput,
} from '../../../../models/risk-verdict.model';
import { RiskAgentService } from '../../../../services/risk-agent.service';
import { UpstreamInputs } from './upstream-inputs';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

async function setup(): Promise<ComponentFixture<UpstreamInputs>> {
  await TestBed.configureTestingModule({
    imports: [UpstreamInputs],
    providers: [provideRouter([])],
  }).compileComponents();
  const fixture = TestBed.createComponent(UpstreamInputs);
  fixture.detectChanges();
  return fixture;
}

function host(fixture: ComponentFixture<unknown>): HTMLElement {
  return fixture.nativeElement as HTMLElement;
}

function cards(fixture: ComponentFixture<unknown>): HTMLElement[] {
  return Array.from(host(fixture).querySelectorAll('app-entity-card'));
}

/** The grid cell one input owns: its card, its notes and its exit. */
function cells(fixture: ComponentFixture<unknown>): HTMLElement[] {
  return cards(fixture).map((card) => card.parentElement as HTMLElement);
}

function service(): RiskAgentService {
  return TestBed.inject(RiskAgentService);
}

const ALLOCATION: FundStateInput = {
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

// ===========================================================================
// Criterion — the two consumed inputs, each with a way back to its author
// ===========================================================================

describe('UpstreamInputs — the two cards', () => {
  it('when the grid renders, it is labelled as the input read from the shared state', async () => {
    const fixture = await setup();
    expect(host(fixture).querySelector('h2')!.textContent).toContain('Input from FundState');
  });

  it('when the grid renders, both consumed fields are named by the field they come from', async () => {
    const fixture = await setup();
    const titles = cards(fixture).map((c) => c.textContent ?? '');

    expect(titles[0]).toContain('state.allocation');
    expect(titles[1]).toContain('state.macro_view');
  });

  it('when the grid renders, each cell carries its source agent and its stamp', async () => {
    const fixture = await setup();
    const [allocation, macro] = cells(fixture).map((c) => c.textContent ?? '');

    expect(allocation).toContain('from Allocation Agent');
    expect(allocation).toContain('8 positions');
    expect(allocation).toContain('updated 09:12 UTC');
    expect(macro).toContain('from Macro & Regimes Agent');
    expect(macro).toContain('updated 08:55 UTC');
  });

  /*
    `EntityCard` truncates its title and its meta to a single line each, and at
    320px the cell is ~256px wide. Anything the spec requires to be readable —
    the position count, the freshness stamp — therefore may not live in `meta`,
    or it is ellipsised away on the narrowest screen the spec names.
  */
  it('when the grid renders, the count and the stamp are outside the truncating meta line', async () => {
    const fixture = await setup();

    for (const card of cards(fixture)) {
      expect(card.textContent).not.toContain('updated');
    }

    const detail = host(fixture).querySelector('[data-detail="allocation"]')!;
    expect(detail.textContent).toContain('8 positions');
    expect(detail.textContent).toContain('updated 09:12 UTC');
    expect(detail.className).not.toContain('truncate');
  });

  it('when the grid renders, each cell holds exactly one link, back to the page that wrote the field', async () => {
    const fixture = await setup();

    for (const [cell, route] of [
      [cells(fixture)[0], '/fund/allocation-agent'],
      [cells(fixture)[1], '/fund/macro-agent'],
    ] as const) {
      const links = cell.querySelectorAll('a');
      expect(links).toHaveLength(1);
      expect(links[0].getAttribute('href')).toBe(route);
    }
  });

  it('when the grid renders, the card itself is not a second interactive element', async () => {
    const fixture = await setup();

    // A card carrying `route` would be an anchor around the cell's own link.
    for (const card of cards(fixture)) {
      expect(card.querySelectorAll('a, button, input, select')).toHaveLength(0);
    }
  });

  it('when the grid renders, each link says where it goes rather than "here"', async () => {
    const fixture = await setup();
    const labels = cells(fixture).map((c) => c.querySelector('a')!.textContent ?? '');

    expect(labels[0]).toContain('Open in Allocation Agent');
    expect(labels[1]).toContain('Open in Macro & Regimes');
  });

  it('when the grid renders, the allocation card states that this agent only consumes it', async () => {
    const fixture = await setup();
    expect(host(fixture).textContent).toContain(CONSUMED_NOTE);
  });

  it('when the grid renders, no field is editable', async () => {
    const fixture = await setup();
    expect(host(fixture).querySelectorAll('input, textarea, select, button')).toHaveLength(0);
  });

  it('when the grid renders, the exit follows the notes it belongs to in reading order', async () => {
    const fixture = await setup();
    const cell = cells(fixture)[0];
    const order = Array.from(cell.children).map((el) => el.tagName.toLowerCase());

    expect(order[0]).toBe('app-entity-card');
    expect(order.at(-1)).toBe('app-cross-page-link');
  });
});

// ===========================================================================
// Criterion — freshness, derived from the two stamps
// ===========================================================================

describe('UpstreamInputs — freshness', () => {
  it('when the macro view predates the allocation, the macro card warns in words', async () => {
    const fixture = await setup();
    const warnings = host(fixture).querySelectorAll('[data-testid="stale-note"]');

    expect(warnings).toHaveLength(1);
    expect(warnings[0].textContent).toContain(MACRO_STALE_NOTE);
    // On the macro card, never on the allocation it is compared against.
    expect(cards(fixture)[1].closest('div')!.textContent).toContain(MACRO_STALE_NOTE);
  });

  it('when the macro view is newer than the allocation, no freshness warning is shown', async () => {
    const fixture = await setup();
    service().readFundState(ALLOCATION, macroAt('2026-08-01T09:20:00Z'));
    fixture.detectChanges();

    expect(host(fixture).querySelectorAll('[data-testid="stale-note"]')).toHaveLength(0);
    expect(host(fixture).textContent).not.toContain(MACRO_STALE_NOTE);
  });

  it('when the macro view has not been written at all, only the allocation card renders', async () => {
    const fixture = await setup();
    service().readFundState(ALLOCATION, null);
    fixture.detectChanges();

    expect(cards(fixture)).toHaveLength(1);
    expect(cards(fixture)[0].textContent).toContain('state.allocation');
  });
});
