import { Component, signal } from '@angular/core';
import { ComponentFixture, TestBed } from '@angular/core/testing';

import { CollectionStatBar } from './collection-stat-bar';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/**
 * The button is not decoration: the bar must never steal focus when its text
 * changes, and the only way to prove that is to hold focus somewhere else
 * while the parts update.
 */
@Component({
  imports: [CollectionStatBar],
  template: `
    <button id="elsewhere" type="button">Elsewhere</button>
    <app-collection-stat-bar [parts]="parts()" />
  `,
})
class HostComponent {
  readonly parts = signal<readonly string[]>([]);
}

async function setup(parts: readonly string[]): Promise<ComponentFixture<HostComponent>> {
  await TestBed.configureTestingModule({ imports: [HostComponent] }).compileComponents();

  const f = TestBed.createComponent(HostComponent);
  f.componentInstance.parts.set(parts);
  f.detectChanges();
  return f;
}

/** The live region, found the way an assistive technology would find it. */
function liveRegion(f: ComponentFixture<unknown>): HTMLElement {
  return f.nativeElement.querySelector('[role="status"]')!;
}

function elsewhereBtn(f: ComponentFixture<unknown>): HTMLButtonElement {
  return f.nativeElement.querySelector('#elsewhere')!;
}

/** Collapses the non-breaking spaces the separator relies on, so a test can
 *  assert the sentence a reader sees rather than the glue holding it together. */
function readingText(el: HTMLElement): string {
  return (el.textContent ?? '').replace(/\s+/g, ' ').trim();
}

const QUEUE_PARTS = [
  '6 of 14 trades in queue',
  'step Human Gate',
  'sorted by waiting time, longest first',
];

// ===========================================================================
// Criterion — parts render joined by a middle dot
// ===========================================================================

describe('CollectionStatBar — joined summary', () => {
  it('when parts are supplied, they render joined by a middle dot', async () => {
    const f = await setup(QUEUE_PARTS);
    expect(readingText(liveRegion(f))).toBe(
      '6 of 14 trades in queue · step Human Gate · sorted by waiting time, longest first',
    );
  });

  it('when four parts are supplied, three separators render', async () => {
    const f = await setup(['184 decisions', 'Decision Log', 'All agents', 'Last 30 days']);
    const dots = readingText(liveRegion(f)).match(/·/g) ?? [];
    expect(dots.length).toBe(3);
  });

  it('when one part is supplied, no separator renders', async () => {
    const f = await setup(['3 of 6 signals selected']);
    expect(readingText(liveRegion(f))).toBe('3 of 6 signals selected');
    expect(readingText(liveRegion(f))).not.toContain('·');
  });

  it('when parts change, the bar shows the new summary and not the old one', async () => {
    const f = await setup(QUEUE_PARTS);
    f.componentInstance.parts.set(['0 of 14 trades in queue', 'step Broker Adapter']);
    f.detectChanges();
    expect(readingText(liveRegion(f))).toBe('0 of 14 trades in queue · step Broker Adapter');
  });
});

// ===========================================================================
// Criterion — empty parts keep the live region in the DOM
// ===========================================================================

describe('CollectionStatBar — empty collection', () => {
  it('when parts is empty, the live region is still in the DOM', async () => {
    const f = await setup([]);
    expect(liveRegion(f)).not.toBeNull();
  });

  it('when parts is empty, nothing visible renders', async () => {
    const f = await setup([]);
    expect(readingText(liveRegion(f))).toBe('');
  });

  it('when parts arrive after an empty start, the announcement lands in the same element', async () => {
    const f = await setup([]);
    const before = liveRegion(f);
    f.componentInstance.parts.set(['184 decisions', 'Decision Log']);
    f.detectChanges();
    expect(liveRegion(f)).toBe(before);
    expect(readingText(liveRegion(f))).toBe('184 decisions · Decision Log');
  });
});

// ===========================================================================
// Criterion — a blank fragment never leaves a separator behind
//
// Callers assemble the line from optional pieces: doc 24's scope is "All
// agents · Last 30 days" only while both filters are set, and doc 16 drops the
// sort criterion when the queue is unsorted. A caller passing '' for the piece
// it has nothing to say about must not produce "184 decisions ·  · Last 30
// days", nor a line that ends on a dot.
// ===========================================================================

describe('CollectionStatBar — blank fragments', () => {
  it('when a part is an empty string, no separator renders in its place', async () => {
    const f = await setup(['184 decisions', '', 'Last 30 days']);
    expect(readingText(liveRegion(f))).toBe('184 decisions · Last 30 days');
  });

  it('when the last part is blank, the line does not end on a separator', async () => {
    const f = await setup(['184 decisions', '   ']);
    expect(readingText(liveRegion(f))).toBe('184 decisions');
    expect(liveRegion(f).textContent ?? '').not.toMatch(/·\s*$/);
  });

  it('when the first part is blank, the line does not open on a separator', async () => {
    const f = await setup(['', 'Decision Log']);
    expect(readingText(liveRegion(f))).toBe('Decision Log');
  });

  it('when every part is blank, nothing visible renders and the live region stays', async () => {
    const f = await setup(['', '  ']);
    expect(liveRegion(f)).not.toBeNull();
    expect(readingText(liveRegion(f))).toBe('');
  });

  it('when a part is padded with spaces, the separator stays glued to its text', async () => {
    const f = await setup(['6 of 14 trades in queue ', ' step Human Gate']);
    expect(readingText(liveRegion(f))).toBe('6 of 14 trades in queue · step Human Gate');
    // A breakable space anywhere left of the dot — even with the non-breaking
    // space still in place — reopens the wrap that strands the separator at
    // the start of the next line.
    expect(liveRegion(f).textContent ?? '').not.toMatch(/[ \t\n][ \u00a0]*·/);
  });
});

// ===========================================================================
// Criterion — polite live region, never assertive
// ===========================================================================

describe('CollectionStatBar — live region politeness', () => {
  it('when rendered, the live region is polite, not assertive', async () => {
    const f = await setup(QUEUE_PARTS);
    expect(liveRegion(f).getAttribute('aria-live')).toBe('polite');
  });

  it('when rendered, the live region carries role="status"', async () => {
    const f = await setup(QUEUE_PARTS);
    expect(liveRegion(f).getAttribute('role')).toBe('status');
  });

  it('when the summary changes, the whole line is announced, not the changed words alone', async () => {
    const f = await setup(QUEUE_PARTS);
    expect(liveRegion(f).getAttribute('aria-atomic')).toBe('true');
  });
});

// ===========================================================================
// Criterion — updating must not move focus
// ===========================================================================

describe('CollectionStatBar — focus is left alone', () => {
  it('when parts update, focus stays where the user left it', async () => {
    const f = await setup(QUEUE_PARTS);
    const btn = elsewhereBtn(f);
    btn.focus();
    expect(document.activeElement).toBe(btn);

    f.componentInstance.parts.set(['1 of 14 trades in queue', 'step Human Gate']);
    f.detectChanges();

    expect(document.activeElement).toBe(btn);
  });

  it('when rendered, the live region is not itself a tab stop', async () => {
    const f = await setup(QUEUE_PARTS);
    expect(liveRegion(f).hasAttribute('tabindex')).toBe(false);
  });
});

// ===========================================================================
// Criterion — wraps rather than overflowing; the separator never strands
// ===========================================================================

describe('CollectionStatBar — wrapping', () => {
  it('when parts are joined, a non-breaking space binds each separator to the text before it', async () => {
    const f = await setup(QUEUE_PARTS);
    const raw = liveRegion(f).textContent ?? '';
    expect(raw.match(/\u00a0·/g)?.length).toBe(2);
  });

  it('when parts are joined, no separator can be stranded on a line of its own', async () => {
    const f = await setup(QUEUE_PARTS);
    const raw = liveRegion(f).textContent ?? '';
    // A breakable space to the left of a dot would let a wrap push it to the
    // start of the next line; a dot at the very end would leave it dangling.
    expect(raw).not.toMatch(/[ \t\n]·/);
    expect(raw).not.toMatch(/·\s*$/);
  });

  it('when a part is longer than the line, the live region may break inside a word', async () => {
    const f = await setup(QUEUE_PARTS);
    expect(liveRegion(f).className).toContain('break-words');
  });

  it('when the bar sits in a flex row, it may shrink below its own content width', async () => {
    // Doc 21 puts the bar beside a "Send 3 to Views Builder" button. As a flex
    // item its default `min-width: auto` floors it at its min-content width,
    // which `overflow-wrap: break-word` does not lower — the row would push
    // the page sideways instead of the text wrapping.
    const f = await setup(QUEUE_PARTS);
    expect(liveRegion(f).className).toContain('min-w-0');
  });
});

// ===========================================================================
// Criterion — small muted text, design tokens only
// ===========================================================================

describe('CollectionStatBar — small muted text', () => {
  it('when rendered, the live region is small secondary text', async () => {
    const f = await setup(QUEUE_PARTS);
    expect(liveRegion(f).className).toContain('text-sm');
    expect(liveRegion(f).className).toContain('text-text-secondary');
  });

  it('when the count changes, the digits keep their width', async () => {
    const f = await setup(['184 decisions', 'Decision Log']);
    expect(liveRegion(f).className).toContain('tabular-nums');
  });

  it('when rendered, no hardcoded hex colours appear in inline element styles', async () => {
    const f = await setup(QUEUE_PARTS);
    const hexPattern = /#[0-9a-fA-F]{3,8}\b/;
    const root = liveRegion(f);
    const all: HTMLElement[] = [root, ...Array.from(root.querySelectorAll<HTMLElement>('*'))];
    for (const el of all) {
      expect(el.getAttribute('style') ?? '').not.toMatch(hexPattern);
    }
  });
});
