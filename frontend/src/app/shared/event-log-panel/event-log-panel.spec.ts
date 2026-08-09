import { Component, Type, signal } from '@angular/core';
import { ComponentFixture, TestBed } from '@angular/core/testing';

import { EventLogPanel, LogEntry } from './event-log-panel';

// ---------------------------------------------------------------------------
// Fixtures
// ---------------------------------------------------------------------------

const ENTRIES: readonly LogEntry[] = [
  { id: 'a', at: '09:14:02', text: 'get_market_data' },
  { id: 'b', at: '09:14:05', text: 'get_risk_metrics', detail: 'covariance shrinkage applied' },
  { id: 'c', at: '09:14:09', text: 'run_optimizer' },
];

interface SetupOptions {
  readonly collapsible?: boolean;
  readonly expanded?: boolean;
  readonly emptyMessage?: string;
  readonly label?: string;
}

async function setup(
  entries: readonly LogEntry[] = ENTRIES,
  options: SetupOptions = {},
): Promise<ComponentFixture<EventLogPanel>> {
  await TestBed.configureTestingModule({ imports: [EventLogPanel] }).compileComponents();

  const f = TestBed.createComponent(EventLogPanel);
  f.componentRef.setInput('entries', entries);
  if (options.collapsible !== undefined) f.componentRef.setInput('collapsible', options.collapsible);
  if (options.expanded !== undefined) f.componentRef.setInput('expanded', options.expanded);
  if (options.emptyMessage !== undefined) {
    f.componentRef.setInput('emptyMessage', options.emptyMessage);
  }
  if (options.label !== undefined) f.componentRef.setInput('label', options.label);
  f.detectChanges();
  return f;
}

// ---------------------------------------------------------------------------
// Hosts — projection, two-way binding, and one-way binding
// ---------------------------------------------------------------------------

@Component({
  imports: [EventLogPanel],
  template: `
    <app-event-log-panel [entries]="entries" [(expanded)]="open">
      <a href="#trace">View full trace</a>
      <button type="button">Retry</button>
    </app-event-log-panel>
  `,
})
class HostComponent {
  readonly entries = ENTRIES;
  open = signal(true);
}

/**
 * The trap this guards: a page that binds `[expanded]` one way and never
 * handles the output. The toggle must still move, because `aria-expanded`
 * announces the panel's state and an announcement that cannot change is a lie.
 */
@Component({
  imports: [EventLogPanel],
  template: `<app-event-log-panel [entries]="entries" [expanded]="open()" />`,
})
class OneWayHostComponent {
  readonly entries = ENTRIES;
  readonly open = signal(true);
}

/** Nothing projected — the trailing-actions strip must collapse out of the layout. */
@Component({
  imports: [EventLogPanel],
  template: `<app-event-log-panel [entries]="entries" />`,
})
class BareHostComponent {
  readonly entries = ENTRIES;
}

async function setupHost<T>(type: Type<T>): Promise<ComponentFixture<T>> {
  await TestBed.configureTestingModule({ imports: [type] }).compileComponents();
  const f = TestBed.createComponent(type);
  f.detectChanges();
  return f;
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function root(f: ComponentFixture<unknown>): HTMLElement {
  return f.nativeElement as HTMLElement;
}

function panel(f: ComponentFixture<unknown>): HTMLElement {
  return root(f).querySelector<HTMLElement>('section')!;
}

function list(f: ComponentFixture<unknown>): HTMLUListElement | null {
  return root(f).querySelector<HTMLUListElement>('ul');
}

function items(f: ComponentFixture<unknown>): HTMLLIElement[] {
  return Array.from(root(f).querySelectorAll<HTMLLIElement>('li'));
}

function entryButtons(f: ComponentFixture<unknown>): HTMLButtonElement[] {
  return Array.from(root(f).querySelectorAll<HTMLButtonElement>('li button'));
}

function toggle(f: ComponentFixture<unknown>): HTMLButtonElement | null {
  return root(f).querySelector<HTMLButtonElement>('button[aria-expanded]');
}

function status(f: ComponentFixture<unknown>): HTMLElement | null {
  return root(f).querySelector<HTMLElement>('[role="status"]');
}

function actionsStrip(f: ComponentFixture<unknown>): HTMLElement {
  return root(f).querySelector<HTMLElement>('[class*="empty:hidden"]')!;
}

function text(el: Element | null): string {
  return (el?.textContent ?? '').replace(/\s+/g, ' ').trim();
}

// ===========================================================================
// Criterion — one list item per entry, with timestamp and text
// ===========================================================================

describe('EventLogPanel — entry rendering', () => {
  it('when entries are supplied, the list is a <ul> with role="list"', async () => {
    const f = await setup();
    expect(list(f)).not.toBeNull();
    expect(list(f)!.getAttribute('role')).toBe('list');
  });

  it('when entries are supplied, one list item per entry renders', async () => {
    const f = await setup();
    expect(items(f).length).toBe(ENTRIES.length);
  });

  it('when entries are supplied, each item renders its timestamp', async () => {
    const f = await setup();
    items(f).forEach((li, i) => {
      expect(text(li)).toContain(ENTRIES[i].at);
    });
  });

  it('when entries are supplied, each item renders its text', async () => {
    const f = await setup();
    items(f).forEach((li, i) => {
      expect(text(li)).toContain(ENTRIES[i].text);
    });
  });

  it('when entries change, the rendered items follow', async () => {
    const f = await setup();
    f.componentRef.setInput('entries', [{ id: 'z', at: '11:00:00', text: 'propose_orders' }]);
    f.detectChanges();
    expect(items(f).length).toBe(1);
    expect(text(items(f)[0])).toContain('propose_orders');
  });
});

// ===========================================================================
// Criterion — the timestamp is tabular-nums and visually distinct
// ===========================================================================

describe('EventLogPanel — timestamp presentation', () => {
  it('when an entry renders, its timestamp element carries tabular-nums', async () => {
    const f = await setup();
    const stamp = items(f)[0].querySelector('.tabular-nums');
    expect(stamp).not.toBeNull();
    expect(text(stamp)).toBe(ENTRIES[0].at);
  });

  it('when an entry renders, the timestamp is a different element from the text', async () => {
    const f = await setup();
    const stamp = items(f)[0].querySelector('.tabular-nums')!;
    expect(text(stamp)).not.toContain(ENTRIES[0].text);
  });
});

// ===========================================================================
// Criterion — activating an entry emits entrySelected with that entry
// ===========================================================================

describe('EventLogPanel — entrySelected', () => {
  it('when an entry is activated, entrySelected emits that entry', async () => {
    const f = await setup();
    const emitted: LogEntry[] = [];
    f.componentInstance.entrySelected.subscribe((e: LogEntry) => emitted.push(e));
    entryButtons(f)[1].click();
    expect(emitted).toEqual([ENTRIES[1]]);
  });

  it('when a different entry is activated, entrySelected emits that other entry', async () => {
    const f = await setup();
    const emitted: LogEntry[] = [];
    f.componentInstance.entrySelected.subscribe((e: LogEntry) => emitted.push(e));
    entryButtons(f)[2].click();
    expect(emitted).toEqual([ENTRIES[2]]);
  });

  it('when no entry is activated, entrySelected does not emit', async () => {
    const f = await setup();
    const emitted: LogEntry[] = [];
    f.componentInstance.entrySelected.subscribe((e: LogEntry) => emitted.push(e));
    expect(emitted).toEqual([]);
  });
});

// ===========================================================================
// Criterion — every entry is keyboard reachable
// ===========================================================================

describe('EventLogPanel — keyboard reachability', () => {
  it('when entries render, every row is a native <button> in the tab order', async () => {
    const f = await setup();
    const buttons = entryButtons(f);
    expect(buttons.length).toBe(ENTRIES.length);
    buttons.forEach((btn) => {
      expect(btn.tagName.toLowerCase()).toBe('button');
      expect(btn.type).toBe('button');
      expect(btn.disabled).toBe(false);
      // A negative tabindex would take the row out of the tab order and strand
      // it — the whole point of making the row a button rather than a div.
      expect(btn.getAttribute('tabindex')).toBeNull();
    });
  });

  it('when an entry is focused, it becomes the active element', async () => {
    const f = await setup();
    const btn = entryButtons(f)[0];
    btn.focus();
    expect(document.activeElement).toBe(btn);
  });

  it('when an entry is focused, its ring is drawn inside its own box', async () => {
    // The row runs to the card edge, and below `sm` the card runs to the
    // viewport edge; the global 2px outline offset would put the sides of the
    // ring off-screen. Never suppressed, only pulled inwards.
    const f = await setup();
    entryButtons(f).forEach((btn) => {
      expect(btn.className).toContain('focus-visible:-outline-offset-2');
      expect(btn.className).not.toContain('outline-none');
    });
  });
});

// ===========================================================================
// Criterion — accessible name contains the entry's own text
// ===========================================================================

describe('EventLogPanel — entry accessible name', () => {
  it("when entries render, each entry button's accessible name contains its own text", async () => {
    const f = await setup();
    entryButtons(f).forEach((btn, i) => {
      const name = btn.getAttribute('aria-label') ?? text(btn);
      expect(name).toContain(ENTRIES[i].text);
    });
  });

  it('when entries render, no two entry buttons share an accessible name', async () => {
    const f = await setup();
    const names = entryButtons(f).map((btn) => btn.getAttribute('aria-label') ?? text(btn));
    expect(new Set(names).size).toBe(names.length);
  });

  it('when entries render, each entry button meets the 44px tap target', async () => {
    const f = await setup();
    entryButtons(f).forEach((btn) => {
      expect(btn.className).toContain('min-h-11');
    });
  });
});

// ===========================================================================
// Criterion — detail renders under the text
// ===========================================================================

describe('EventLogPanel — entry detail', () => {
  it('when an entry has a detail, the detail text renders', async () => {
    const f = await setup();
    expect(text(items(f)[1])).toContain('covariance shrinkage applied');
  });

  it('when an entry has no detail, no detail text is invented for it', async () => {
    const f = await setup();
    // Squashed rather than normalised: whether the compiler leaves a space
    // between two adjacent spans is not this component's contract.
    const squash = (s: string) => s.replace(/\s+/g, '');
    expect(squash(text(items(f)[0]))).toBe(squash(ENTRIES[0].at + ENTRIES[0].text));
  });
});

// ===========================================================================
// Criterion — empty state
// ===========================================================================

describe('EventLogPanel — empty state', () => {
  it('when entries is empty, the empty message renders in a role="status" element', async () => {
    const f = await setup([]);
    expect(status(f)).not.toBeNull();
    expect(text(status(f))).toBe('No events recorded.');
  });

  it('when entries is empty, no list items exist', async () => {
    const f = await setup([]);
    expect(items(f).length).toBe(0);
  });

  it('when entries is empty, no <ul> is rendered', async () => {
    const f = await setup([]);
    expect(list(f)).toBeNull();
  });

  it('when emptyMessage is supplied, that message renders instead of the default', async () => {
    const f = await setup([], { emptyMessage: 'No alerts in this window.' });
    expect(text(status(f))).toBe('No alerts in this window.');
  });

  it('when entries are supplied, no empty status element renders', async () => {
    const f = await setup();
    expect(status(f)).toBeNull();
  });

  it('when entries drain to empty, the list is replaced by the status message', async () => {
    const f = await setup();
    expect(list(f)).not.toBeNull();
    f.componentRef.setInput('entries', []);
    f.detectChanges();
    expect(list(f)).toBeNull();
    expect(text(status(f))).toBe('No events recorded.');
  });
});

// ===========================================================================
// Criterion — collapsible header
// ===========================================================================

describe('EventLogPanel — collapsible header', () => {
  it('when collapsible, a toggle button with aria-expanded renders', async () => {
    const f = await setup();
    expect(toggle(f)).not.toBeNull();
  });

  it('when collapsible is false, no toggle button renders', async () => {
    const f = await setup(ENTRIES, { collapsible: false });
    expect(toggle(f)).toBeNull();
  });

  it('when collapsible is false, the list still renders', async () => {
    const f = await setup(ENTRIES, { collapsible: false });
    expect(items(f).length).toBe(ENTRIES.length);
  });

  it('when expanded, the toggle reports aria-expanded="true"', async () => {
    const f = await setup();
    expect(toggle(f)!.getAttribute('aria-expanded')).toBe('true');
  });

  it('when collapsed, the toggle reports aria-expanded="false"', async () => {
    const f = await setup(ENTRIES, { expanded: false });
    expect(toggle(f)!.getAttribute('aria-expanded')).toBe('false');
  });

  it('when collapsible, aria-controls names an element present in the DOM', async () => {
    const f = await setup();
    const controls = toggle(f)!.getAttribute('aria-controls');
    expect(controls).toBeTruthy();
    expect(root(f).querySelector(`#${controls}`)).not.toBeNull();
  });

  it('when collapsible, aria-controls names the element the list lives in', async () => {
    const f = await setup();
    const controls = toggle(f)!.getAttribute('aria-controls');
    const region = root(f).querySelector(`#${controls}`)!;
    expect(region.contains(list(f))).toBe(true);
  });

  it('when collapsed, aria-controls still resolves to an element', async () => {
    // The controlled region survives the collapse even though its contents do
    // not; an aria-controls pointing at nothing resolves to nothing.
    const f = await setup(ENTRIES, { expanded: false });
    const controls = toggle(f)!.getAttribute('aria-controls');
    expect(root(f).querySelector(`#${controls}`)).not.toBeNull();
  });

  it('when two panels render, their controlled regions have different ids', async () => {
    // Doc 15 draws two logs on one page. A shared id would point both toggles
    // at whichever region the document happened to reach first.
    const a = await setup();
    const b = TestBed.createComponent(EventLogPanel);
    b.componentRef.setInput('entries', ENTRIES);
    b.detectChanges();
    expect(toggle(a)!.getAttribute('aria-controls')).not.toBe(
      toggle(b)!.getAttribute('aria-controls'),
    );
  });

  it('when collapsible, the toggle meets the 44px tap target', async () => {
    const f = await setup();
    expect(toggle(f)!.className).toContain('min-h-11');
  });

  it('when expanded and the header is activated, expandedChange emits false', async () => {
    const f = await setup();
    const emitted: boolean[] = [];
    f.componentInstance.expanded.subscribe((v: boolean) => emitted.push(v));
    toggle(f)!.click();
    expect(emitted).toEqual([false]);
  });

  it('when collapsed and the header is activated, expandedChange emits true', async () => {
    const f = await setup(ENTRIES, { expanded: false });
    const emitted: boolean[] = [];
    f.componentInstance.expanded.subscribe((v: boolean) => emitted.push(v));
    toggle(f)!.click();
    expect(emitted).toEqual([true]);
  });

  it('when collapsed, the list is not present in the DOM', async () => {
    const f = await setup(ENTRIES, { expanded: false });
    expect(list(f)).toBeNull();
    expect(items(f).length).toBe(0);
  });

  it('when collapsed and entries is empty, the empty status is not present either', async () => {
    const f = await setup([], { expanded: false });
    expect(status(f)).toBeNull();
  });

  it('when the count is one, the toggle says "entry" rather than "entries"', async () => {
    const f = await setup([ENTRIES[0]]);
    expect(text(toggle(f))).toContain('1 entry');
    expect(text(toggle(f))).not.toContain('entries');
  });
});

// ===========================================================================
// Criterion — the panel and its toggle are named
// ===========================================================================

describe('EventLogPanel — naming', () => {
  it('when no label is supplied, the toggle falls back to "Event log"', async () => {
    const f = await setup();
    expect(text(toggle(f))).toContain('Event log');
  });

  it('when a label is supplied, the toggle is named with it', async () => {
    const f = await setup(ENTRIES, { label: 'Alert & breach log' });
    expect(text(toggle(f))).toContain('Alert & breach log');
    expect(text(toggle(f))).not.toContain('Event log');
  });

  it('when a label is supplied, the panel region carries it as its accessible name', async () => {
    const f = await setup(ENTRIES, { label: 'Alert & breach log' });
    expect(panel(f).getAttribute('aria-label')).toBe('Alert & breach log');
  });

  it('when collapsible is false, the panel region is still named', async () => {
    // Doc 18 draws the log with no toggle at all; without a name on the
    // section there would be nothing identifying the region to a screen reader.
    const f = await setup(ENTRIES, { collapsible: false, label: 'Alert & breach log' });
    expect(toggle(f)).toBeNull();
    expect(panel(f).getAttribute('aria-label')).toBe('Alert & breach log');
  });
});

// ===========================================================================
// Criterion — projected trailing actions and expansion binding
// ===========================================================================

describe('EventLogPanel — projected actions', () => {
  it('when trailing actions are projected, they render inside the panel', async () => {
    const f = await setupHost(HostComponent);
    const host = root(f);
    expect(host.querySelector('a[href="#trace"]')).not.toBeNull();
    expect(text(host.querySelector('a[href="#trace"]'))).toBe('View full trace');
  });

  it('when the panel is collapsed, the projected actions stay reachable', async () => {
    const f = await setupHost(HostComponent);
    toggle(f)!.click();
    f.detectChanges();
    expect(root(f).querySelector('a[href="#trace"]')).not.toBeNull();
  });

  it('when nothing is projected, the trailing strip matches :empty so it hides', async () => {
    // `empty:hidden` is the only reliable read of an unused content slot, and
    // it fails the moment Angular leaves any node behind in it.
    const f = await setupHost(BareHostComponent);
    expect(actionsStrip(f).childNodes.length).toBe(0);
    expect(actionsStrip(f).matches(':empty')).toBe(true);
  });

  it('when actions are projected, the trailing strip does not match :empty', async () => {
    const f = await setupHost(HostComponent);
    expect(actionsStrip(f).matches(':empty')).toBe(false);
  });
});

describe('EventLogPanel — expansion binding', () => {
  it('when the host binds [(expanded)], activating the header collapses the list', async () => {
    const f = await setupHost(HostComponent);
    expect(list(f)).not.toBeNull();
    toggle(f)!.click();
    f.detectChanges();
    expect(f.componentInstance.open()).toBe(false);
    expect(list(f)).toBeNull();
  });

  it('when the host binds [(expanded)], writing the host signal drives the panel', async () => {
    const f = await setupHost(HostComponent);
    f.componentInstance.open.set(false);
    f.detectChanges();
    expect(toggle(f)!.getAttribute('aria-expanded')).toBe('false');
    expect(list(f)).toBeNull();
  });

  it('when the host binds [expanded] one way, the toggle still reports the state it is in', async () => {
    const f = await setupHost(OneWayHostComponent);
    expect(toggle(f)!.getAttribute('aria-expanded')).toBe('true');
    toggle(f)!.click();
    f.detectChanges();
    expect(toggle(f)!.getAttribute('aria-expanded')).toBe('false');
    expect(list(f)).toBeNull();
  });
});

// ===========================================================================
// Criterion — design tokens; no hardcoded hex
// ===========================================================================

describe('EventLogPanel — token colours only', () => {
  it('when rendered, no hardcoded hex colours appear in inline styles or class names', async () => {
    const f = await setup();
    const hexPattern = /#[0-9a-fA-F]{3,8}\b/;
    const all: HTMLElement[] = [root(f), ...Array.from(root(f).querySelectorAll<HTMLElement>('*'))];
    for (const el of all) {
      expect(el.getAttribute('style') ?? '').not.toMatch(hexPattern);
      // Arbitrary Tailwind values (`text-[#0f0]`) route around the token set
      // just as effectively as an inline style, so they are checked too.
      expect(el.getAttribute('class') ?? '').not.toMatch(hexPattern);
    }
  });
});
