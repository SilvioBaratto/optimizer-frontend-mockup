import { Component, signal } from '@angular/core';
import { ComponentFixture, TestBed } from '@angular/core/testing';

import { FilterChipBar } from './filter-chip-bar';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

type Inputs = Record<string, unknown>;

async function setup(inputs: Inputs = {}): Promise<ComponentFixture<FilterChipBar>> {
  await TestBed.configureTestingModule({ imports: [FilterChipBar] }).compileComponents();
  const f = TestBed.createComponent(FilterChipBar);
  for (const [name, value] of Object.entries(inputs)) {
    f.componentRef.setInput(name, value);
  }
  f.detectChanges();
  return f;
}

function searchInput(f: ComponentFixture<unknown>): HTMLInputElement | null {
  return f.nativeElement.querySelector('input[type="search"]');
}

function searchLabelEl(f: ComponentFixture<unknown>): HTMLLabelElement | null {
  return f.nativeElement.querySelector('label');
}

function liveRegion(f: ComponentFixture<unknown>): HTMLElement | null {
  return f.nativeElement.querySelector('[aria-live="polite"]');
}

function controlRow(f: ComponentFixture<unknown>): HTMLElement | null {
  return f.nativeElement.querySelector('[data-testid="filter-chip-bar-controls"]');
}

/** Every element the component renders, host included. */
function allElements(f: ComponentFixture<unknown>): HTMLElement[] {
  const root = f.nativeElement as HTMLElement;
  return [root, ...Array.from(root.querySelectorAll<HTMLElement>('*'))];
}

function type(input: HTMLInputElement, value: string): void {
  input.value = value;
  input.dispatchEvent(new Event('input', { bubbles: true }));
}

/** Host that projects controls, so projection is exercised through a real parent. */
@Component({
  imports: [FilterChipBar],
  template: `
    <app-filter-chip-bar [searchLabel]="label()" [count]="count()" [total]="total()">
      <label for="stage-filter">Stage</label>
      <select id="stage-filter">
        <option>All</option>
      </select>
      <button id="projected-chip" type="button">Blocked</button>
    </app-filter-chip-bar>
  `,
})
class HostComponent {
  readonly label = signal('');
  readonly count = signal<number | null>(null);
  readonly total = signal<number | null>(null);
}

async function setupHost(): Promise<ComponentFixture<HostComponent>> {
  await TestBed.configureTestingModule({ imports: [HostComponent] }).compileComponents();
  const f = TestBed.createComponent(HostComponent);
  f.detectChanges();
  return f;
}

// ===========================================================================
// Criterion — the search field is present only when asked for, and labelled
// ===========================================================================

describe('FilterChipBar — search field', () => {
  it('when searchLabel is set, a type="search" input renders', async () => {
    const f = await setup({ searchLabel: 'Search symbol' });
    expect(searchInput(f)).not.toBeNull();
  });

  it('when searchLabel is set, a <label> is associated with the input by id', async () => {
    const f = await setup({ searchLabel: 'Search symbol' });
    const input = searchInput(f)!;
    const label = searchLabelEl(f)!;
    expect(input.id).toBeTruthy();
    expect(label.getAttribute('for')).toBe(input.id);
  });

  it('when searchLabel is set, the label text is the searchLabel value', async () => {
    const f = await setup({ searchLabel: 'Search symbol' });
    expect(searchLabelEl(f)?.textContent?.trim()).toBe('Search symbol');
  });

  it('when searchLabel is empty, no search input renders', async () => {
    const f = await setup();
    expect(searchInput(f)).toBeNull();
  });

  it('when searchLabel is cleared, the search input is removed', async () => {
    const f = await setup({ searchLabel: 'Search symbol' });
    f.componentRef.setInput('searchLabel', '');
    f.detectChanges();
    expect(searchInput(f)).toBeNull();
  });

  it('when searchPlaceholder is set, the input carries it and the label still exists', async () => {
    const f = await setup({ searchLabel: 'Search symbol', searchPlaceholder: 'AAPL, TLT…' });
    expect(searchInput(f)?.getAttribute('placeholder')).toBe('AAPL, TLT…');
    expect(searchLabelEl(f)).not.toBeNull();
  });

  it('when searchPlaceholder is empty, no placeholder attribute is emitted', async () => {
    const f = await setup({ searchLabel: 'Search symbol' });
    expect(searchInput(f)?.hasAttribute('placeholder')).toBe(false);
  });

  it('when searchValue is set, the input shows that value', async () => {
    const f = await setup({ searchLabel: 'Search symbol', searchValue: 'TLT' });
    expect(searchInput(f)?.value).toBe('TLT');
  });

  it('when two bars render, their search inputs carry different ids', async () => {
    await TestBed.configureTestingModule({ imports: [FilterChipBar] }).compileComponents();
    const a = TestBed.createComponent(FilterChipBar);
    a.componentRef.setInput('searchLabel', 'First');
    a.detectChanges();
    const b = TestBed.createComponent(FilterChipBar);
    b.componentRef.setInput('searchLabel', 'Second');
    b.detectChanges();
    const idA = (a.nativeElement as HTMLElement).querySelector('input')!.id;
    const idB = (b.nativeElement as HTMLElement).querySelector('input')!.id;
    expect(idA).toBeTruthy();
    expect(idA).not.toBe(idB);
  });

  it('when rendered, the search input meets the 44px tap target', async () => {
    const f = await setup({ searchLabel: 'Search symbol' });
    expect(searchInput(f)?.className).toContain('min-h-11');
  });

  it('when focused from the keyboard, the search input becomes the active element', async () => {
    const f = await setup({ searchLabel: 'Search symbol' });
    const input = searchInput(f)!;
    input.focus();
    expect(document.activeElement).toBe(input);
    expect(input.hasAttribute('disabled')).toBe(false);
    expect(input.getAttribute('tabindex')).toBeNull();
  });
});

// ===========================================================================
// Criterion — typing emits
// ===========================================================================

describe('FilterChipBar — searchChange', () => {
  it('when the user types, searchChange emits the new value', async () => {
    const f = await setup({ searchLabel: 'Search symbol' });
    const emitted: string[] = [];
    f.componentInstance.searchChange.subscribe((v: string) => emitted.push(v));
    type(searchInput(f)!, 'EEM');
    expect(emitted).toEqual(['EEM']);
  });

  it('when the user clears the field, searchChange emits the empty string', async () => {
    const f = await setup({ searchLabel: 'Search symbol', searchValue: 'EEM' });
    const emitted: string[] = [];
    f.componentInstance.searchChange.subscribe((v: string) => emitted.push(v));
    type(searchInput(f)!, '');
    expect(emitted).toEqual(['']);
  });

  /*
    The caller owns `searchValue`, so it will push the value it just received
    straight back in. If that echoed and re-emitted, every consumer would need
    its own loop guard.
  */
  it('when the caller pushes a new searchValue, searchChange does not emit', async () => {
    const f = await setup({ searchLabel: 'Search symbol', searchValue: 'EE' });
    const emitted: string[] = [];
    f.componentInstance.searchChange.subscribe((v: string) => emitted.push(v));
    f.componentRef.setInput('searchValue', 'EEM');
    f.detectChanges();
    expect(emitted).toEqual([]);
    expect(searchInput(f)?.value).toBe('EEM');
  });
});

// ===========================================================================
// Criterion — the live result count
// ===========================================================================

describe('FilterChipBar — live count', () => {
  it('when count and total are set, the live region reads "N of M results"', async () => {
    const f = await setup({ count: 6, total: 14 });
    expect(liveRegion(f)?.textContent?.replace(/\s+/g, ' ').trim()).toBe('6 of 14 results');
  });

  it('when only count is set, the live region reads "N results"', async () => {
    const f = await setup({ count: 14 });
    expect(liveRegion(f)?.textContent?.replace(/\s+/g, ' ').trim()).toBe('14 results');
  });

  it('when countNoun is set, the live region uses that noun', async () => {
    const f = await setup({ count: 6, total: 14, countNoun: 'trades' });
    expect(liveRegion(f)?.textContent?.replace(/\s+/g, ' ').trim()).toBe('6 of 14 trades');
  });

  it('when count is zero, the live region still reads the count', async () => {
    const f = await setup({ count: 0, total: 14, countNoun: 'orders' });
    expect(liveRegion(f)?.textContent?.replace(/\s+/g, ' ').trim()).toBe('0 of 14 orders');
  });

  it('when count is null, the live region carries no count text', async () => {
    const f = await setup({ total: 14 });
    expect(liveRegion(f)?.textContent?.trim()).toBe('');
  });

  /*
    A page service that types an optional field `number | undefined` hands the
    binding `undefined`, not `null`. A strict `=== null` check lets it through
    and prints "undefined results" into a live region.
  */
  it('when count is undefined, the live region carries no count text', async () => {
    const f = await setup({ count: undefined, total: 14 });
    expect(liveRegion(f)?.textContent?.trim()).toBe('');
  });

  it('when total is undefined, the live region reads the count alone', async () => {
    const f = await setup({ count: 14, total: undefined, countNoun: 'orders' });
    expect(liveRegion(f)?.textContent?.replace(/\s+/g, ' ').trim()).toBe('14 orders');
  });

  it('when no count is set, an aria-live="polite" region is still mounted', async () => {
    const f = await setup();
    expect(liveRegion(f)).not.toBeNull();
  });

  it('when the count changes, the new text lives inside the same aria-live="polite" element', async () => {
    const f = await setup({ count: 14, total: 14, countNoun: 'orders' });
    const before = liveRegion(f);
    f.componentRef.setInput('count', 3);
    f.detectChanges();
    const after = liveRegion(f);
    expect(after).toBe(before);
    expect(after?.getAttribute('aria-live')).toBe('polite');
    expect(after?.textContent?.replace(/\s+/g, ' ').trim()).toBe('3 of 14 orders');
  });

  it('when the count renders, its element uses tabular-nums', async () => {
    const f = await setup({ count: 6, total: 14 });
    const el = liveRegion(f)!.querySelector('[data-testid="filter-chip-bar-count"]');
    expect(el?.className).toContain('tabular-nums');
  });
});

// ===========================================================================
// Criterion — the free-text summary line
// ===========================================================================

describe('FilterChipBar — summary', () => {
  it('when summary is set, it renders inside the live region', async () => {
    const f = await setup({ count: 14, summary: '3 pending approval · 1 blocked' });
    expect(liveRegion(f)?.textContent).toContain('3 pending approval · 1 blocked');
  });

  it('when summary is empty, no summary text renders', async () => {
    const f = await setup({ count: 14 });
    expect(liveRegion(f)?.querySelector('[data-testid="filter-chip-bar-summary"]')).toBeNull();
  });
});

// ===========================================================================
// Criterion — projected controls
// ===========================================================================

describe('FilterChipBar — projected controls', () => {
  it('when content is projected, it renders in the control row', async () => {
    const f = await setupHost();
    const chip = f.nativeElement.querySelector('#projected-chip') as HTMLElement;
    expect(chip).not.toBeNull();
    expect(controlRow(f)?.contains(chip)).toBe(true);
  });

  it('when several controls are projected, all of them land in the control row', async () => {
    const f = await setupHost();
    const row = controlRow(f)!;
    expect(row.querySelector('#stage-filter')).not.toBeNull();
    expect(row.querySelector('#projected-chip')).not.toBeNull();
  });

  it('when rendered below sm, the control row scrolls horizontally without a scrollbar', async () => {
    const f = await setup();
    const row = controlRow(f)!;
    expect(row.className).toContain('overflow-x-auto');
    expect(row.className).toContain('scrollbar-hidden');
  });

  it('when rendered below sm, the control row snaps and never shrinks its children', async () => {
    const f = await setup();
    const row = controlRow(f)!;
    expect(row.className).toContain('snap-x');
    expect(row.className).toContain('[&>*]:snap-start');
    expect(row.className).toContain('[&>*]:shrink-0');
  });

  /*
    `flex-1` is `flex-basis: 0`, so this row contributes nothing to line
    breaking and the count beside it takes its max-content width first. At
    320px with doc 15's count plus summary that left the row about 26px wide.
    Content sizing (`min-w-0`, no `flex-1`) is what stops the count starving it.
  */
  it('when the count sits beside it, the control row is sized from its content, not from zero', async () => {
    const f = await setup({ count: 14, countNoun: 'orders', summary: '3 pending · 1 blocked' });
    const row = controlRow(f)!;
    expect(row.className).toContain('min-w-0');
    expect(row.className.split(/\s+/)).not.toContain('flex-1');
  });

  /*
    The scroller is the floor that keeps an over-wide row inside its own box.
    Reverting to `overflow-x: visible` above `sm` puts doc 17's six controls
    outside the page at 768px, where the sidebar takes 260px of the width.
  */
  it('when rendered above sm, the control row still scrolls inside itself', async () => {
    const f = await setup();
    const classes = controlRow(f)!.className.split(/\s+/);
    expect(classes).toContain('overflow-x-auto');
    expect(classes.some((c) => c.endsWith('overflow-x-visible'))).toBe(false);
  });

  /*
    A scroll container clips on both axes — including the left edge at
    scrollLeft 0 — so a focused child's 2px ring at 2px offset needs padding to
    paint into, and an equal negative margin to keep the margin box (what flex
    gap and alignment measure) where it was.
  */
  it('when a control is focused inside the scroller, its ring has room on every side', async () => {
    const classes = controlRow(await setup())!.className.split(/\s+/);
    expect(classes).toContain('p-1.5');
    expect(classes).toContain('-m-1.5');
  });
});

// ===========================================================================
// Criterion — the count never squeezes the controls at 320px
// ===========================================================================

describe('FilterChipBar — narrow viewport behaviour', () => {
  it('when rendered below sm, the live count takes its own line', async () => {
    const classes = liveRegion(await setup({ count: 6, total: 14 }))!.className.split(/\s+/);
    expect(classes).toContain('w-full');
    expect(classes).toContain('sm:w-auto');
  });

  it('when the summary holds an unbreakable token, the live region can break it', async () => {
    const f = await setup({ count: 6, summary: 'TRD-2031-0000000000000000000000' });
    expect(liveRegion(f)!.className).toContain('break-words');
  });

  it('when the search field renders, it takes the full width below sm', async () => {
    const f = await setup({ searchLabel: 'Search symbol' });
    const field = searchInput(f)!.parentElement!;
    expect(field.className).toContain('w-full');
    expect(field.className).toContain('sm:w-56');
  });
});

// ===========================================================================
// Criterion — the host is a block, and positions nothing
// ===========================================================================

describe('FilterChipBar — layout contract', () => {
  it('when rendered, the host element is a block so callers can space it', async () => {
    const f = await setup();
    expect((f.nativeElement as HTMLElement).className.split(/\s+/)).toContain('block');
  });

  /*
    Docs 15 and 24 stick this bar under their toolbar at different offsets and
    doc 16 does not stick it at all. Positioning is the caller's, so nothing
    here may take a position out of static flow.
  */
  it('when rendered, nothing in the bar positions itself', async () => {
    const f = await setup({ searchLabel: 'Search symbol', count: 6, total: 14, summary: 'x' });
    const positioning = /(^|:)(sticky|fixed|absolute)$/;
    for (const el of allElements(f)) {
      for (const cls of el.className.split(/\s+/).filter(Boolean)) {
        expect(cls).not.toMatch(positioning);
      }
    }
  });

  it('when rendered, no z-index is claimed', async () => {
    const f = await setup({ searchLabel: 'Search symbol', count: 6 });
    for (const el of allElements(f)) {
      for (const cls of el.className.split(/\s+/).filter(Boolean)) {
        expect(cls).not.toMatch(/(^|:)z-/);
      }
    }
  });
});

// ===========================================================================
// Criterion — design tokens; no hardcoded hex
// ===========================================================================

/*
  The inherited version of this test read only the `style` attribute. Nothing
  in this template sets one, so it passed no matter what the colours were — it
  would have passed with `text-[#ff0000]` on every element. Tailwind is where a
  hardcoded colour would actually be written, so the class attribute is scanned
  too, and the assertion is proved to bite by a fixture that carries one.
*/
describe('FilterChipBar — token colours only', () => {
  const COLOUR_LITERAL = /#[0-9a-fA-F]{3,8}\b|\brgba?\(|\bhsla?\(/;

  it('when rendered, no hardcoded colour appears in inline element styles', async () => {
    const f = await setup({
      searchLabel: 'Search symbol',
      count: 6,
      total: 14,
      summary: '1 blocked',
    });
    for (const el of allElements(f)) {
      expect(el.getAttribute('style') ?? '').not.toMatch(COLOUR_LITERAL);
    }
  });

  it('when rendered, no arbitrary-value colour utility appears in any class', async () => {
    const f = await setup({
      searchLabel: 'Search symbol',
      searchPlaceholder: 'AAPL, TLT…',
      count: 6,
      total: 14,
      summary: '1 blocked',
    });
    for (const el of allElements(f)) {
      expect(el.getAttribute('class') ?? '').not.toMatch(COLOUR_LITERAL);
    }
  });

  it('when a class does carry a colour literal, the check fails', () => {
    expect('text-[#ff0000] bg-surface').toMatch(COLOUR_LITERAL);
    expect('bg-[rgb(0,0,0)]').toMatch(COLOUR_LITERAL);
    expect('bg-surface-raised text-text-secondary border-border-control').not.toMatch(
      COLOUR_LITERAL,
    );
  });
});
