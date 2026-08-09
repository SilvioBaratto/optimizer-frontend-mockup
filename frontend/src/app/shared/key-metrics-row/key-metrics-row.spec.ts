import { Component } from '@angular/core';
import { ComponentFixture, TestBed } from '@angular/core/testing';

import { KeyMetric, KeyMetricsRow } from './key-metrics-row';

// ---------------------------------------------------------------------------
// Fixtures
// ---------------------------------------------------------------------------

/** Doc 19's shape: four figures, one of them badged. */
const FOUR_METRICS: readonly KeyMetric[] = [
  { label: 'Total risk (EC)', value: '$4,182,300' },
  {
    label: 'Sum of contributions',
    value: '100.0%',
    badge: { label: 'Full allocation', tone: 'ok' },
  },
  { label: 'Portfolio DI', value: '0.72', note: 'moderate' },
  { label: 'Allocation rule', value: 'Euler', note: 'coherent · Aumann-Shapley' },
];

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

async function setup(metrics: readonly KeyMetric[]): Promise<ComponentFixture<KeyMetricsRow>> {
  await TestBed.configureTestingModule({
    imports: [KeyMetricsRow],
  }).compileComponents();

  const f = TestBed.createComponent(KeyMetricsRow);
  f.componentRef.setInput('metrics', metrics);
  f.detectChanges();
  return f;
}

function root(f: ComponentFixture<unknown>): HTMLElement {
  return f.nativeElement as HTMLElement;
}

function list(f: ComponentFixture<unknown>): HTMLElement {
  return root(f).querySelector('dl')!;
}

function terms(f: ComponentFixture<unknown>): HTMLElement[] {
  return Array.from(root(f).querySelectorAll<HTMLElement>('dt'));
}

function definitions(f: ComponentFixture<unknown>): HTMLElement[] {
  return Array.from(root(f).querySelectorAll<HTMLElement>('dd'));
}

/** The trailing projection slot — the row's last child, after the list. */
function slot(f: ComponentFixture<unknown>): HTMLElement {
  return root(f).querySelector<HTMLElement>('.surface-card > *:last-child')!;
}

function text(el: Element | null): string {
  return (el?.textContent ?? '').replace(/\s+/g, ' ').trim();
}

// ===========================================================================
// Criterion — a real description list, one <dt>/<dd> pair per metric
// ===========================================================================

describe('KeyMetricsRow — description-list semantics', () => {
  it('when metrics are supplied, exactly one <dl> renders', async () => {
    const f = await setup(FOUR_METRICS);
    expect(root(f).querySelectorAll('dl').length).toBe(1);
  });

  it('when 4 metrics are supplied, 4 <dt> and 4 <dd> elements render', async () => {
    const f = await setup(FOUR_METRICS);
    expect(terms(f).length).toBe(4);
    expect(definitions(f).length).toBe(4);
  });

  it('when 4 metrics are supplied, the <dt> elements carry the metric labels in order', async () => {
    const f = await setup(FOUR_METRICS);
    expect(terms(f).map(text)).toEqual([
      'Total risk (EC)',
      'Sum of contributions',
      'Portfolio DI',
      'Allocation rule',
    ]);
  });

  it('when 4 metrics are supplied, each <dd> starts with its own metric value', async () => {
    const f = await setup(FOUR_METRICS);
    const values = definitions(f).map(text);
    expect(values[0]).toContain('$4,182,300');
    expect(values[1]).toContain('100.0%');
    expect(values[2]).toContain('0.72');
    expect(values[3]).toContain('Euler');
  });

  it('when metrics are supplied, every <dt> and <dd> is a child of the description list', async () => {
    const f = await setup(FOUR_METRICS);
    const dl = list(f);
    [...terms(f), ...definitions(f)].forEach((el) => {
      expect(dl.contains(el)).toBe(true);
    });
  });
});

// ===========================================================================
// Criterion — optional note
// ===========================================================================

describe('KeyMetricsRow — note', () => {
  it('when a metric has a note, the note text renders inside its <dd>', async () => {
    const f = await setup(FOUR_METRICS);
    expect(text(definitions(f)[2])).toContain('moderate');
  });

  it('when a metric has no note, its <dd> carries only the value text', async () => {
    const f = await setup(FOUR_METRICS);
    expect(text(definitions(f)[0])).toBe('$4,182,300');
  });

  it('when a metric has a note, the note follows the value inside the <dd>', async () => {
    const f = await setup(FOUR_METRICS);
    const dd = definitions(f)[2];
    const value = dd.querySelector('[data-testid="metric-value"]')!;
    const note = dd.querySelector('[data-testid="metric-note"]')!;
    expect(value.compareDocumentPosition(note) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
  });

  it('when a metric has both a note and a badge, both render alongside the value', async () => {
    const f = await setup([
      {
        label: 'As of',
        value: '2026-07-30 16:00 UTC',
        note: '24 assets · AR window 500d',
        badge: { label: 'Snapshot stale', tone: 'warn' },
      },
    ]);
    const dd = definitions(f)[0];
    expect(text(dd)).toContain('2026-07-30 16:00 UTC');
    expect(text(dd)).toContain('24 assets · AR window 500d');
    expect(text(dd.querySelector('app-status-badge'))).toContain('Snapshot stale');
  });

  it('when a note carries digits, it is set in tabular figures like the value', async () => {
    const f = await setup(FOUR_METRICS);
    const notes = Array.from(root(f).querySelectorAll<HTMLElement>('[data-testid="metric-note"]'));
    expect(notes.length).toBe(2);
    notes.forEach((el) => {
      expect(el.className).toContain('tabular-nums');
    });
  });
});

// ===========================================================================
// Criterion — optional badge, never colour alone
// ===========================================================================

describe('KeyMetricsRow — badge', () => {
  it('when a metric has a badge, the badge label renders as text', async () => {
    const f = await setup(FOUR_METRICS);
    const badge = definitions(f)[1].querySelector('app-status-badge');
    expect(badge).not.toBeNull();
    expect(text(badge)).toContain('Full allocation');
  });

  it('when a metric has no badge, no status badge renders in its <dd>', async () => {
    const f = await setup(FOUR_METRICS);
    expect(definitions(f)[0].querySelector('app-status-badge')).toBeNull();
  });

  it('when a badge tone changes, the label text is still what names the state', async () => {
    const f = await setup([
      {
        label: 'Sum of contributions',
        value: '86.4%',
        badge: { label: 'Under-covered', tone: 'warn' },
      },
    ]);
    expect(text(definitions(f)[0])).toContain('Under-covered');
  });
});

// ===========================================================================
// Criterion — no empty element left behind
// ===========================================================================

describe('KeyMetricsRow — no empty leftovers', () => {
  it('when a metric has no note or badge, every element inside the list still carries text', async () => {
    const f = await setup([
      { label: 'VaR (95%, hist., 1D)', value: '3.42% of NAV' },
      { label: 'CVaR / ES (95%)', value: '4.87% of NAV' },
    ]);
    const inner = Array.from(list(f).querySelectorAll<HTMLElement>('*'));
    expect(inner.length).toBeGreaterThan(0);
    inner.forEach((el) => {
      expect(text(el)).not.toBe('');
    });
  });

  /*
    The projection slot is the one container that can legitimately be empty, so
    it is asserted directly rather than by scanning for leftovers: a scan that
    finds nothing passes for the wrong reason. Two things have to hold together
    for `empty:hidden` to remove it — the class has to be on it, and the
    element has to actually match `:empty`. Angular's whitespace stripping and
    the fact that `<ng-content />` leaves no placeholder node are what make the
    second true, and neither is guaranteed by the first.
  */
  it('when no content is projected, the trailing slot is empty and marked empty:hidden', async () => {
    const f = await setup(FOUR_METRICS);
    expect(slot(f).className).toContain('empty:hidden');
    expect(slot(f).matches(':empty')).toBe(true);
  });

  it('when no content is projected, the slot is the only element in the row without text', async () => {
    const f = await setup(FOUR_METRICS);
    const empties = Array.from(root(f).querySelectorAll<HTMLElement>('div, span, p')).filter(
      (el) => text(el) === '',
    );
    expect(empties.length).toBe(1);
    expect(empties[0]).toBe(slot(f));
  });
});

// ===========================================================================
// Criterion — projected trailing slot (doc 25's refresh control)
// ===========================================================================

@Component({
  selector: 'test-key-metrics-host',
  imports: [KeyMetricsRow],
  template: `
    <app-key-metrics-row [metrics]="metrics">
      <button type="button" data-testid="refresh">Refresh</button>
    </app-key-metrics-row>
  `,
})
class TestKeyMetricsHost {
  readonly metrics: readonly KeyMetric[] = [
    { label: 'As of', value: '2026-07-30 16:00 UTC', note: '24 assets · AR window 500d' },
    { label: 'Snapshot age', value: '18h', note: 'within the expected cadence' },
  ];
}

describe('KeyMetricsRow — projected content', () => {
  it('when content is projected, it renders inside the row', async () => {
    await TestBed.configureTestingModule({ imports: [TestKeyMetricsHost] }).compileComponents();
    const f = TestBed.createComponent(TestKeyMetricsHost);
    f.detectChanges();

    const row = (f.nativeElement as HTMLElement).querySelector('app-key-metrics-row')!;
    const projected = row.querySelector('[data-testid="refresh"]');
    expect(projected).not.toBeNull();
    expect(text(projected)).toBe('Refresh');
  });

  it('when content is projected, it renders after the description list in the DOM', async () => {
    await TestBed.configureTestingModule({ imports: [TestKeyMetricsHost] }).compileComponents();
    const f = TestBed.createComponent(TestKeyMetricsHost);
    f.detectChanges();

    const row = (f.nativeElement as HTMLElement).querySelector('app-key-metrics-row')!;
    const dl = row.querySelector('dl')!;
    const projected = row.querySelector('[data-testid="refresh"]')!;
    expect(dl.compareDocumentPosition(projected) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
  });

  it('when content is projected, the trailing slot stops matching :empty', async () => {
    await TestBed.configureTestingModule({ imports: [TestKeyMetricsHost] }).compileComponents();
    const f = TestBed.createComponent(TestKeyMetricsHost);
    f.detectChanges();

    expect(slot(f).matches(':empty')).toBe(false);
  });

  /*
    From `sm` the slot is `shrink-0` inside a `justify-between` row and is
    already hard against the right edge; the width where the alignment does the
    work is the mobile column, where the slot stretches. An `sm:`-prefixed
    justification would therefore align nothing at any width — hence the
    unprefixed assertion.
  */
  it('when content is projected, the slot right-aligns it at every width', async () => {
    await TestBed.configureTestingModule({ imports: [TestKeyMetricsHost] }).compileComponents();
    const f = TestBed.createComponent(TestKeyMetricsHost);
    f.detectChanges();

    const cls = slot(f).className.split(/\s+/);
    expect(cls).toContain('justify-end');
  });
});

// ===========================================================================
// Criterion — one bordered surface, responsive column count
// ===========================================================================

describe('KeyMetricsRow — single surface and column count', () => {
  it('when rendered, the metrics sit inside one .surface-card container', async () => {
    const f = await setup(FOUR_METRICS);
    const cards = root(f).querySelectorAll('.surface-card');
    expect(cards.length).toBe(1);
    expect(cards[0].contains(list(f))).toBe(true);
  });

  it('when 4 metrics are supplied, the list is 1 column, 2 at sm and 4 from lg', async () => {
    const f = await setup(FOUR_METRICS);
    const cls = list(f).className;
    expect(cls).toContain('grid-cols-1');
    expect(cls).toContain('sm:grid-cols-2');
    expect(cls).toContain('lg:grid-cols-4');
  });

  it('when 3 metrics are supplied, the list is 3 columns from lg', async () => {
    const f = await setup(FOUR_METRICS.slice(0, 3));
    expect(list(f).className).toContain('lg:grid-cols-3');
  });

  /*
    Two metrics reach two columns at `sm` and stay there, so an explicit
    `lg:grid-cols-2` would be a rule that changes nothing. What matters is that
    the row never widens past the number of figures it holds — asserted as
    "not 3 and not 4" rather than "no lg rule at all", which would fail a
    later, equally correct map that spells the redundant rule out.
  */
  it('when 2 metrics are supplied, the list never widens past 2 columns', async () => {
    const f = await setup(FOUR_METRICS.slice(0, 2));
    const cls = list(f).className;
    expect(cls).toContain('sm:grid-cols-2');
    expect(cls).not.toContain('lg:grid-cols-3');
    expect(cls).not.toContain('lg:grid-cols-4');
  });

  it('when more than 4 metrics are supplied, the column count caps at 4', async () => {
    const f = await setup([
      ...FOUR_METRICS,
      { label: 'Effective rank', value: '6.4' },
      { label: 'PC1 share', value: '38.2%' },
    ]);
    expect(list(f).className).toContain('lg:grid-cols-4');
  });
});

// ===========================================================================
// Criterion — figures are tabular-nums
// ===========================================================================

describe('KeyMetricsRow — number rendering', () => {
  it('when rendered, every metric value carries tabular-nums', async () => {
    const f = await setup(FOUR_METRICS);
    const values = Array.from(
      root(f).querySelectorAll<HTMLElement>('[data-testid="metric-value"]'),
    );
    expect(values.length).toBe(4);
    values.forEach((el) => {
      expect(el.className).toContain('tabular-nums');
    });
  });
});

// ===========================================================================
// Criterion — design tokens; no hardcoded hex
// ===========================================================================

describe('KeyMetricsRow — token colours only', () => {
  /*
    Scanning `style` alone passes whatever the markup says, because nothing in
    this component sets an inline style — a green test that proves nothing. In
    a Tailwind template a hardcoded colour arrives as an arbitrary value in the
    class attribute (`text-[#b3261e]`, `bg-[#fff]`), so that is what has to be
    read.
  */
  it('when rendered, no element carries a hardcoded hex colour', async () => {
    const f = await setup(FOUR_METRICS);
    const hexPattern = /#[0-9a-fA-F]{3,8}\b/;
    const all: HTMLElement[] = [root(f), ...Array.from(root(f).querySelectorAll<HTMLElement>('*'))];
    for (const el of all) {
      expect(el.getAttribute('style') ?? '').not.toMatch(hexPattern);
      expect(el.getAttribute('class') ?? '').not.toMatch(hexPattern);
    }
  });
});

// ===========================================================================
// Criterion — narrow viewports and narrow columns
// ===========================================================================

describe('KeyMetricsRow — narrow layouts', () => {
  /*
    `overflow-wrap` is inherited, so one declaration on the group covers the
    term, the figure and the note. Without it a token longer than a
    `minmax(0, 1fr)` track — which is what `grid-cols-4` builds — paints
    outside the track and widens the document rather than wrapping.
  */
  it('when rendered, each metric group allows a long token to break inside itself', async () => {
    const f = await setup(FOUR_METRICS);
    const groups = Array.from(list(f).children) as HTMLElement[];
    expect(groups.length).toBe(4);
    groups.forEach((group) => {
      expect(group.className.split(/\s+/)).toContain('break-words');
    });
  });

  /*
    Doc 25 sticks this region to the top of the content area. A custom element
    is `display: inline` by default, and neither `position: sticky` nor the
    `.surface-card` mobile bleed behaves predictably on an inline box, so the
    host has to declare its own display rather than borrow one from whichever
    parent it happens to land in.
  */
  it('when rendered, the host element is a block so a page can position it', async () => {
    const f = await setup(FOUR_METRICS);
    expect(root(f).classList.contains('block')).toBe(true);
  });
});

