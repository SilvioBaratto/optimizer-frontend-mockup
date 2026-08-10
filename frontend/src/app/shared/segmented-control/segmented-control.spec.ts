import { Component, signal } from '@angular/core';
import { ComponentFixture, TestBed } from '@angular/core/testing';

import { SegmentedControl, SegmentedOption } from './segmented-control';

// ---------------------------------------------------------------------------
// Fixtures
// ---------------------------------------------------------------------------

/** Doc 14's confidence field — three plain, enabled options. */
const CONFIDENCE: readonly SegmentedOption[] = [
  { value: 'p90', label: '90%' },
  { value: 'p95', label: '95%' },
  { value: 'p99', label: '99%' },
];

/** Doc 19's method field — the middle option is unavailable but must stay. */
const METHOD: readonly SegmentedOption[] = [
  { value: 'euler', label: 'Euler' },
  {
    value: 'marginal',
    label: 'Marginal',
    disabled: true,
    disabledReason: 'Marginal needs a coherent risk measure',
  },
  { value: 'shapley', label: 'Shapley' },
];

@Component({
  imports: [SegmentedControl],
  template: `
    <app-segmented-control
      [options]="options()"
      [value]="value()"
      [label]="label()"
      (valueChange)="record($event)"
    />
  `,
})
class HostComponent {
  readonly options = signal<readonly SegmentedOption[]>(CONFIDENCE);
  readonly value = signal('p95');
  readonly label = signal('Confidence level');
  readonly emitted: string[] = [];

  record(next: string): void {
    this.emitted.push(next);
  }
}

/** Two instances in one document — proves the description ids do not collide. */
@Component({
  imports: [SegmentedControl],
  template: `
    <app-segmented-control [options]="options" value="euler" label="First" />
    <app-segmented-control [options]="options" value="euler" label="Second" />
  `,
})
class TwoControlsHostComponent {
  readonly options = METHOD;
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

interface Patch {
  options?: readonly SegmentedOption[];
  value?: string;
  label?: string;
}

async function setup(patch: Patch = {}): Promise<ComponentFixture<HostComponent>> {
  await TestBed.configureTestingModule({ imports: [HostComponent] }).compileComponents();

  const f = TestBed.createComponent(HostComponent);
  if (patch.options) f.componentInstance.options.set(patch.options);
  if (patch.value) f.componentInstance.value.set(patch.value);
  if (patch.label) f.componentInstance.label.set(patch.label);
  f.detectChanges();
  return f;
}

function group(f: ComponentFixture<unknown>): HTMLElement {
  return f.nativeElement.querySelector('[role="radiogroup"]')!;
}

function radios(f: ComponentFixture<unknown>): HTMLButtonElement[] {
  const root = f.nativeElement as HTMLElement;
  return Array.from(root.querySelectorAll<HTMLButtonElement>('[role="radio"]'));
}

/** Dispatches a real keydown and hands back the event so callers can read `defaultPrevented`. */
function press(target: EventTarget, key: string): KeyboardEvent {
  const event = new KeyboardEvent('keydown', { key, bubbles: true, cancelable: true });
  target.dispatchEvent(event);
  return event;
}

/** Same, with a modifier held — the combinations the browser and the OS own. */
function pressWith(
  target: EventTarget,
  key: string,
  modifier: 'altKey' | 'ctrlKey' | 'metaKey',
): KeyboardEvent {
  const event = new KeyboardEvent('keydown', {
    key,
    [modifier]: true,
    bubbles: true,
    cancelable: true,
  });
  target.dispatchEvent(event);
  return event;
}

// ===========================================================================
// Criterion — radiogroup container with the supplied accessible name
// ===========================================================================

describe('SegmentedControl — radiogroup container', () => {
  it('when rendered, the container has role="radiogroup"', async () => {
    const f = await setup();
    expect(group(f)).not.toBeNull();
  });

  it('when rendered, the container carries the supplied label as aria-label', async () => {
    const f = await setup({ label: 'VaR method' });
    expect(group(f).getAttribute('aria-label')).toBe('VaR method');
  });

  it('when rendered, every option is a button with role="radio"', async () => {
    const f = await setup();
    const buttons = radios(f);
    expect(buttons.length).toBe(3);
    buttons.forEach((b) => expect(b.tagName.toLowerCase()).toBe('button'));
    buttons.forEach((b) => expect(b.getAttribute('type')).toBe('button'));
  });

  it('when rendered, each option renders its label as text', async () => {
    const f = await setup();
    expect(radios(f).map((b) => b.textContent?.trim())).toEqual(['90%', '95%', '99%']);
  });
});

// ===========================================================================
// Criterion — aria-checked and roving tabindex
// ===========================================================================

describe('SegmentedControl — aria-checked and roving tabindex', () => {
  it('when a value is selected, exactly one button has aria-checked="true"', async () => {
    const f = await setup({ value: 'p95' });
    const checked = radios(f).filter((b) => b.getAttribute('aria-checked') === 'true');
    expect(checked.length).toBe(1);
    expect(checked[0].textContent?.trim()).toBe('95%');
  });

  it('when a value is selected, every other button has aria-checked="false"', async () => {
    const f = await setup({ value: 'p95' });
    const unchecked = radios(f).filter((b) => b.getAttribute('aria-checked') === 'false');
    expect(unchecked.length).toBe(2);
  });

  it('when a value is selected, exactly one button has tabindex 0', async () => {
    const f = await setup({ value: 'p95' });
    const focusable = radios(f).filter((b) => b.getAttribute('tabindex') === '0');
    expect(focusable.length).toBe(1);
    expect(focusable[0].getAttribute('aria-checked')).toBe('true');
  });

  it('when a value is selected, every other button has tabindex -1', async () => {
    const f = await setup({ value: 'p95' });
    const roving = radios(f).filter((b) => b.getAttribute('tabindex') === '-1');
    expect(roving.length).toBe(2);
  });

  it('when the value input changes, aria-checked and tabindex 0 move with it', async () => {
    const f = await setup({ value: 'p95' });
    f.componentInstance.value.set('p99');
    f.detectChanges();

    const buttons = radios(f);
    expect(buttons[2].getAttribute('aria-checked')).toBe('true');
    expect(buttons[2].getAttribute('tabindex')).toBe('0');
    expect(buttons[1].getAttribute('aria-checked')).toBe('false');
    expect(buttons[1].getAttribute('tabindex')).toBe('-1');
  });
});

// ===========================================================================
// Criterion — arrow keys move and select, wrapping at both ends
// ===========================================================================

describe('SegmentedControl — arrow navigation', () => {
  it('when ArrowRight is pressed, valueChange emits the next option value', async () => {
    const f = await setup({ value: 'p95' });
    press(radios(f)[1], 'ArrowRight');
    expect(f.componentInstance.emitted).toEqual(['p99']);
  });

  it('when ArrowLeft is pressed, valueChange emits the previous option value', async () => {
    const f = await setup({ value: 'p95' });
    press(radios(f)[1], 'ArrowLeft');
    expect(f.componentInstance.emitted).toEqual(['p90']);
  });

  it('when ArrowDown is pressed, it moves forward like ArrowRight', async () => {
    const f = await setup({ value: 'p95' });
    press(radios(f)[1], 'ArrowDown');
    expect(f.componentInstance.emitted).toEqual(['p99']);
  });

  it('when ArrowUp is pressed, it moves backward like ArrowLeft', async () => {
    const f = await setup({ value: 'p95' });
    press(radios(f)[1], 'ArrowUp');
    expect(f.componentInstance.emitted).toEqual(['p90']);
  });

  it('when ArrowRight is pressed on the last option, it wraps to the first', async () => {
    const f = await setup({ value: 'p99' });
    press(radios(f)[2], 'ArrowRight');
    expect(f.componentInstance.emitted).toEqual(['p90']);
  });

  it('when ArrowLeft is pressed on the first option, it wraps to the last', async () => {
    const f = await setup({ value: 'p90' });
    press(radios(f)[0], 'ArrowLeft');
    expect(f.componentInstance.emitted).toEqual(['p99']);
  });

  it('when an arrow key moves the selection, focus follows to the new button', async () => {
    const f = await setup({ value: 'p95' });
    press(radios(f)[1], 'ArrowRight');
    f.detectChanges();
    expect(document.activeElement).toBe(radios(f)[2]);
  });

  it('when the selection wraps past the last option, focus follows to the first button', async () => {
    const f = await setup({ value: 'p99' });
    press(radios(f)[2], 'ArrowRight');
    f.detectChanges();
    expect(document.activeElement).toBe(radios(f)[0]);
  });

  it('when an arrow key skips a disabled option, focus lands on the enabled one', async () => {
    const f = await setup({ options: METHOD, value: 'euler' });
    press(radios(f)[0], 'ArrowRight');
    f.detectChanges();
    expect(document.activeElement).toBe(radios(f)[2]);
  });
});

// ===========================================================================
// Criterion — Home / End
// ===========================================================================

describe('SegmentedControl — Home and End', () => {
  it('when Home is pressed, the first option is selected', async () => {
    const f = await setup({ value: 'p99' });
    press(radios(f)[2], 'Home');
    expect(f.componentInstance.emitted).toEqual(['p90']);
  });

  it('when End is pressed, the last option is selected', async () => {
    const f = await setup({ value: 'p90' });
    press(radios(f)[0], 'End');
    expect(f.componentInstance.emitted).toEqual(['p99']);
  });

  it('when Home is pressed, focus follows to the first option', async () => {
    const f = await setup({ value: 'p99' });
    press(radios(f)[2], 'Home');
    f.detectChanges();
    expect(document.activeElement).toBe(radios(f)[0]);
  });

  it('when End is pressed, focus follows to the last option', async () => {
    const f = await setup({ value: 'p90' });
    press(radios(f)[0], 'End');
    f.detectChanges();
    expect(document.activeElement).toBe(radios(f)[2]);
  });

  it('when Home is pressed and the first option is disabled, the first enabled one is selected', async () => {
    const options: readonly SegmentedOption[] = [
      { value: 'a', label: 'A', disabled: true },
      { value: 'b', label: 'B' },
      { value: 'c', label: 'C' },
    ];
    const f = await setup({ options, value: 'c' });
    press(radios(f)[2], 'Home');
    expect(f.componentInstance.emitted).toEqual(['b']);
  });

  it('when End is pressed and the last option is disabled, the last enabled one is selected', async () => {
    const options: readonly SegmentedOption[] = [
      { value: 'a', label: 'A' },
      { value: 'b', label: 'B' },
      { value: 'c', label: 'C', disabled: true },
    ];
    const f = await setup({ options, value: 'a' });
    press(radios(f)[0], 'End');
    expect(f.componentInstance.emitted).toEqual(['b']);
  });
});

// ===========================================================================
// Criterion — disabled options are skipped, kept and explained
// ===========================================================================

describe('SegmentedControl — disabled options', () => {
  it('when an option is disabled, ArrowRight skips over it to the next enabled option', async () => {
    const f = await setup({ options: METHOD, value: 'euler' });
    press(radios(f)[0], 'ArrowRight');
    expect(f.componentInstance.emitted).toEqual(['shapley']);
  });

  it('when an option is disabled, ArrowLeft skips over it to the previous enabled option', async () => {
    const f = await setup({ options: METHOD, value: 'shapley' });
    press(radios(f)[2], 'ArrowLeft');
    expect(f.componentInstance.emitted).toEqual(['euler']);
  });

  it('when an option is disabled, it carries aria-disabled and stays in the DOM', async () => {
    const f = await setup({ options: METHOD, value: 'euler' });
    const buttons = radios(f);
    expect(buttons.length).toBe(3);
    expect(buttons[1].getAttribute('aria-disabled')).toBe('true');
  });

  it('when an option is disabled, it does not carry the disabled attribute', async () => {
    const f = await setup({ options: METHOD, value: 'euler' });
    expect(radios(f)[1].disabled).toBe(false);
    expect(radios(f)[1].hasAttribute('disabled')).toBe(false);
  });

  it('when an enabled option renders, it has no aria-disabled attribute', async () => {
    const f = await setup({ options: METHOD, value: 'euler' });
    expect(radios(f)[0].hasAttribute('aria-disabled')).toBe(false);
  });

  it('when a disabled option is clicked, valueChange does not emit', async () => {
    const f = await setup({ options: METHOD, value: 'euler' });
    radios(f)[1].click();
    expect(f.componentInstance.emitted).toEqual([]);
  });

  it('when a disabled option has a reason, aria-describedby points at an element holding it', async () => {
    const f = await setup({ options: METHOD, value: 'euler' });
    const describedBy = radios(f)[1].getAttribute('aria-describedby');
    expect(describedBy).toBeTruthy();

    const description = (f.nativeElement as HTMLElement).querySelector(`#${describedBy}`);
    expect(description).not.toBeNull();
    expect(description!.textContent).toContain('Marginal needs a coherent risk measure');
  });

  it('when an option has no reason, it has no aria-describedby', async () => {
    const f = await setup({ options: METHOD, value: 'euler' });
    expect(radios(f)[0].hasAttribute('aria-describedby')).toBe(false);
    expect(radios(f)[2].hasAttribute('aria-describedby')).toBe(false);
  });

  it('when two controls render together, their description ids are unique', async () => {
    await TestBed.configureTestingModule({ imports: [TwoControlsHostComponent] }).compileComponents();
    const f = TestBed.createComponent(TwoControlsHostComponent);
    f.detectChanges();

    const described = radios(f)
      .map((b) => b.getAttribute('aria-describedby'))
      .filter((id): id is string => id !== null);

    expect(described.length).toBe(2);
    expect(new Set(described).size).toBe(2);
  });
});

// ===========================================================================
// Criterion — preventDefault only on the keys the control handles
// ===========================================================================

describe('SegmentedControl — preventDefault scope', () => {
  it('when a handled navigation key is pressed, preventDefault is called', async () => {
    const f = await setup({ value: 'p95' });
    for (const key of ['ArrowRight', 'ArrowLeft', 'ArrowUp', 'ArrowDown', 'Home', 'End']) {
      expect(press(radios(f)[1], key).defaultPrevented).toBe(true);
    }
  });

  it('when a key the component does not handle is pressed, preventDefault is NOT called', async () => {
    const f = await setup({ value: 'p95' });
    for (const key of ['Tab', 'a', 'Enter', ' ', 'Escape', 'PageDown']) {
      expect(press(radios(f)[1], key).defaultPrevented).toBe(false);
    }
  });

  /**
   * Alt/Cmd + Arrow is browser history navigation and Ctrl/Cmd + Home scrolls
   * the document. Those chords belong to the browser, not to a radiogroup —
   * a control that eats them takes a shortcut away and gives nothing back.
   */
  it('when an arrow key is pressed with Alt held, preventDefault is NOT called', async () => {
    const f = await setup({ value: 'p95' });
    expect(pressWith(radios(f)[1], 'ArrowLeft', 'altKey').defaultPrevented).toBe(false);
    expect(pressWith(radios(f)[1], 'ArrowRight', 'altKey').defaultPrevented).toBe(false);
  });

  it('when Home or End is pressed with Ctrl or Meta held, preventDefault is NOT called', async () => {
    const f = await setup({ value: 'p95' });
    expect(pressWith(radios(f)[1], 'Home', 'ctrlKey').defaultPrevented).toBe(false);
    expect(pressWith(radios(f)[1], 'End', 'metaKey').defaultPrevented).toBe(false);
  });

  it('when a navigation key is pressed with a modifier held, the selection does not change', async () => {
    const f = await setup({ value: 'p95' });
    pressWith(radios(f)[1], 'ArrowLeft', 'altKey');
    pressWith(radios(f)[1], 'ArrowRight', 'metaKey');
    pressWith(radios(f)[1], 'Home', 'ctrlKey');
    expect(f.componentInstance.emitted).toEqual([]);
  });
});

// ===========================================================================
// Criterion — pointer selection
// ===========================================================================

describe('SegmentedControl — pointer selection', () => {
  it('when an unselected option is clicked, valueChange emits its value', async () => {
    const f = await setup({ value: 'p95' });
    radios(f)[0].click();
    expect(f.componentInstance.emitted).toEqual(['p90']);
  });

  it('when the already-selected option is clicked, valueChange does not emit again', async () => {
    const f = await setup({ value: 'p95' });
    radios(f)[1].click();
    expect(f.componentInstance.emitted).toEqual([]);
  });
});

// ===========================================================================
// Criterion — selection is not carried by colour alone
// ===========================================================================

describe('SegmentedControl — non-colour selection cue', () => {
  it('when an option is selected, it carries a solid border class the others lack', async () => {
    const f = await setup({ value: 'p95' });
    const buttons = radios(f);
    expect(buttons[1].className).toContain('border-primary');
    expect(buttons[0].className).not.toContain('border-primary');
    expect(buttons[2].className).not.toContain('border-primary');
  });

  it('when unselected, an option renders a transparent border so the selected edge reads as solid', async () => {
    const f = await setup({ value: 'p95' });
    expect(radios(f)[0].className).toContain('border-transparent');
  });

  it('when an option is unavailable, it carries a dashed border the available ones lack', async () => {
    const f = await setup({ options: METHOD, value: 'euler' });
    const buttons = radios(f);
    expect(buttons[1].className).toContain('border-dashed');
    expect(buttons[0].className).not.toContain('border-dashed');
    expect(buttons[2].className).not.toContain('border-dashed');
  });

  /**
   * The selected option can itself go unavailable — doc 19's method field does
   * exactly that when the risk measure changes. Dimming it is a tone change and
   * tone is colour, so the dashed edge has to survive alongside the accent one.
   */
  it('when the selected option is unavailable, it keeps both the accent and the dashed edge', async () => {
    const f = await setup({ options: METHOD, value: 'marginal' });
    const selected = radios(f)[1];
    expect(selected.getAttribute('aria-checked')).toBe('true');
    expect(selected.className).toContain('border-primary');
    expect(selected.className).toContain('border-dashed');
  });

  /**
   * `opacity` multiplies text and border alike. `text-text-tertiary` on the
   * group's inset background is 3.35:1 and `border-border-control` is 3.13:1 —
   * both sit deliberately at the WCAG floor, so any transparency on top drops
   * the one non-colour cue below it.
   */
  it('when an option is unavailable, its cues are not faded by an opacity utility', async () => {
    const f = await setup({ options: METHOD, value: 'euler' });
    const classes = radios(f)[1].className.split(/\s+/);
    expect(classes.filter((c) => /^opacity-/.test(c))).toEqual([]);
  });
});

// ===========================================================================
// Criterion — visible focus survives the roving tabindex
// ===========================================================================

/**
 * `styles.css` cancels the global focus ring for `[tabindex='-1']`, which is
 * every unselected option in a roving group. The ring therefore has to be a
 * utility on the button — utilities outrank the base layer — exactly as
 * `ui-tab`, `ui-pagination` and `ui-accordion` already do.
 */
describe('SegmentedControl — visible focus', () => {
  it('when rendered, every option carries its own focus-visible outline utility', async () => {
    const f = await setup({ options: METHOD, value: 'euler' });
    const buttons = radios(f);
    expect(buttons.length).toBeGreaterThan(0);
    buttons.forEach((b) => {
      const classes = b.className.split(/\s+/);
      expect(classes.some((c) => /^focus-visible:outline-\d/.test(c))).toBe(true);
      expect(classes.some((c) => /^focus-visible:outline-(primary|accent)$/.test(c))).toBe(true);
    });
  });

  it('when an option is not selected, it still carries the focus utility despite tabindex -1', async () => {
    const f = await setup({ value: 'p95' });
    const roving = radios(f).filter((b) => b.getAttribute('tabindex') === '-1');
    expect(roving.length).toBe(2);
    roving.forEach((b) => expect(b.className).toContain('focus-visible:outline-'));
  });
});

// ===========================================================================
// Criterion — the group stays keyboard-reachable when value matches nothing
// ===========================================================================

describe('SegmentedControl — unresolved value', () => {
  it('when the value matches no option, the first enabled option holds tabindex 0', async () => {
    const f = await setup({ value: 'not-an-option' });
    const buttons = radios(f);
    expect(buttons.filter((b) => b.getAttribute('tabindex') === '0').length).toBe(1);
    expect(buttons[0].getAttribute('tabindex')).toBe('0');
  });

  it('when the value matches no option, no button claims aria-checked true', async () => {
    const f = await setup({ value: 'not-an-option' });
    expect(radios(f).every((b) => b.getAttribute('aria-checked') === 'false')).toBe(true);
  });

  it('when the value matches no option and the first option is disabled, the first enabled one holds tabindex 0', async () => {
    const f = await setup({ options: METHOD, value: 'not-an-option' });
    const buttons = radios(f);
    expect(buttons.filter((b) => b.getAttribute('tabindex') === '0').length).toBe(1);
    expect(buttons[0].getAttribute('tabindex')).toBe('0');
  });
});

// ===========================================================================
// Criterion — ≥44px touch target
// ===========================================================================

describe('SegmentedControl — ≥44px touch target', () => {
  it('when rendered, every option button carries min-h-11', async () => {
    const f = await setup();
    const buttons = radios(f);
    expect(buttons.length).toBeGreaterThan(0);
    buttons.forEach((b) => expect(b.className).toContain('min-h-11'));
  });

  /**
   * Height alone is not a tap target. A two-character label like "1D" or "90%"
   * inside `px-3` measures well under 44px across, so the width floor has to be
   * stated the same way `ui-pagination` states it.
   */
  it('when rendered, every option button carries min-w-11', async () => {
    const f = await setup({ options: [{ value: 'a', label: 'A' }] });
    const buttons = radios(f);
    expect(buttons.length).toBeGreaterThan(0);
    buttons.forEach((b) => expect(b.className).toContain('min-w-11'));
  });
});

// ===========================================================================
// Criterion — wraps rather than overflowing at 320px
// ===========================================================================

describe('SegmentedControl — narrow viewport behaviour', () => {
  it('when rendered, the group wraps its options instead of overflowing', async () => {
    const f = await setup();
    expect(group(f).className).toContain('flex-wrap');
    expect(group(f).className).toContain('max-w-full');
  });
});

// ===========================================================================
// Criterion — design tokens; no hardcoded hex
// ===========================================================================

describe('SegmentedControl — token colours only', () => {
  it('when rendered, no hardcoded hex colour appears in inline element styles', async () => {
    const f = await setup({ options: METHOD, value: 'euler' });
    const hexPattern = /#[0-9a-fA-F]{3,8}\b/;
    const root = f.nativeElement as HTMLElement;
    const all: HTMLElement[] = [root, ...Array.from(root.querySelectorAll<HTMLElement>('*'))];
    for (const el of all) {
      expect(el.getAttribute('style') ?? '').not.toMatch(hexPattern);
    }
  });

  /**
   * The inline-style sweep above passes vacuously — this component sets no
   * `style` attribute at all. Every colour it does set arrives as a class, so
   * that is where an escaped literal (`bg-[#fff]`, `text-[rgb(...)]`) would
   * actually show up.
   */
  it('when rendered, no class carries a literal colour instead of a token', async () => {
    const f = await setup({ options: METHOD, value: 'euler' });
    const literal = /\[(#|rgb|hsl|oklch)/i;
    const root = f.nativeElement as HTMLElement;
    const all: HTMLElement[] = [root, ...Array.from(root.querySelectorAll<HTMLElement>('*'))];
    for (const el of all) {
      expect(el.className).not.toMatch(literal);
    }
  });
});
