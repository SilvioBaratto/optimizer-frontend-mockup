import { Component, signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';

import { ICON_PROVIDER } from '../../../icons';
import { PageContextBar } from '../../page-context-bar/page-context-bar';
import { Shell } from '../shell';
import { Topbar } from './topbar';

@Component({
  imports: [Topbar],
  template: `<app-shell-topbar [sidebarOpen]="open()" />`,
})
class HostComponent {
  readonly open = signal(false);
}

/**
 * The number in a utility such as `z-20`, `h-14` or `md:top-14`.
 *
 * Throws rather than returning null, so a missing class reads as "the topbar
 * declares no layer" instead of as a comparison against nothing.
 */
function utilityValue(element: HTMLElement, utility: string): number {
  const match = new RegExp(`(?:^|\\s)${utility}-(\\d+)(?:\\s|$)`).exec(element.className);
  if (!match) throw new Error(`no \`${utility}-*\` utility in "${element.className}"`);
  return Number(match[1]);
}

/** Tailwind's spacing scale is 0.25rem a step, and the root font size is 16px. */
function spacingPx(element: HTMLElement, utility: string): number {
  return utilityValue(element, utility) * 4;
}

describe('Topbar', () => {
  let host: HTMLElement;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [HostComponent],
      providers: [provideRouter([]), ICON_PROVIDER],
    }).compileComponents();

    const fixture = TestBed.createComponent(HostComponent);
    host = fixture.nativeElement;
    fixture.detectChanges();
  });

  const topbar = () => host.querySelector('app-shell-topbar') as HTMLElement;
  const header = () => host.querySelector('app-shell-topbar header') as HTMLElement;

  // --- the pin ---
  //
  // The header shipped `position: static` from the first commit. Measured at
  // 390x844 on /risk/risk-attribution, scrolling 1200px took it to top -1200
  // and the burger with it — and below `md` that burger is the only way to
  // open the drawer, on pages that run to 6000px.

  it('when rendered, the host carries the sticky position and an offset', () => {
    expect(topbar().classList.contains('sticky')).toBe(true);
    expect(topbar().classList.contains('top-0')).toBe(true);
  });

  it('when rendered, the host has an explicit block display so it can be positioned', () => {
    // A custom element is `display: inline` by default, and an inline box
    // ignores `position`, `top` and `z-index` alike. This is the half of the
    // fix that is invisible in the markup and inert on its own.
    expect(topbar().classList.contains('block')).toBe(true);
  });

  it('when rendered, the inner header does not also claim sticky', () => {
    // The header's containing block is the host, whose box is exactly the
    // header's own height — a sticky box with nowhere to slide never moves.
    // The host's containing block is the shell's `min-h-dvh` column instead.
    expect(header().className).not.toMatch(/(^|\s)sticky(\s|$)/);
    expect(header().className).not.toMatch(/(^|\s)top-0(\s|$)/);
  });

  it('when the viewport is narrow, the pin still applies', () => {
    // Unprefixed, not `md:` — the burger this keeps reachable only exists
    // below `md`, so a desktop-only pin would miss the case it is for.
    expect(topbar().className).not.toMatch(/(^|\s)md:sticky(\s|$)/);
  });

  // --- the stacking order ---

  it('when the drawer is open, the backdrop dims the topbar rather than sitting behind it', async () => {
    // The backdrop and the topbar are siblings in `shell.html`, so equal
    // z-index values would resolve by DOM order — which puts the topbar last
    // and therefore on top. The values have to be strictly ordered.
    const shell = await renderShellWithDrawerOpen();
    const backdrop = shell.querySelector('div[aria-hidden="true"].fixed') as HTMLElement;
    const bar = shell.querySelector('app-shell-topbar') as HTMLElement;

    expect(backdrop).not.toBeNull();
    expect(utilityValue(bar, 'z')).toBeLessThan(utilityValue(backdrop, 'z'));
  });

  it('when a page context bar slides up to the topbar, the topbar is the layer on top', () => {
    const contextBar = renderContextBar();

    expect(utilityValue(topbar(), 'z')).toBeGreaterThan(utilityValue(contextBar, 'md:z'));
  });

  // --- what the context bars have to clear ---

  it('when a page context bar pins, its offset clears the topbar height', () => {
    // `md:top-0` would rest it under the topbar, where it reads as gone.
    const offset = spacingPx(renderContextBar(), 'md:top');

    expect(offset).toBe(spacingPx(header(), 'h'));
    expect(offset).toBeGreaterThan(0);
  });
});

/** A `PageContextBar` in its own fixture, read for the classes it really ships. */
function renderContextBar(): HTMLElement {
  const fixture = TestBed.createComponent(PageContextBar);
  fixture.detectChanges();
  return fixture.nativeElement as HTMLElement;
}

/**
 * The real shell at a phone width with the drawer open, which is the only
 * state that renders the backdrop.
 */
async function renderShellWithDrawerOpen(): Promise<HTMLElement> {
  // `Shell` measures `window.innerWidth` in its constructor to decide whether
  // the sidebar is a drawer; jsdom reports 1024 by default.
  Object.defineProperty(window, 'innerWidth', { value: 390, configurable: true });

  const fixture = TestBed.createComponent(Shell);
  fixture.detectChanges();
  const element = fixture.nativeElement as HTMLElement;

  const burger = element.querySelector(
    'app-shell-topbar button[aria-controls="shell-sidebar"]',
  ) as HTMLButtonElement;
  burger.click();
  fixture.detectChanges();

  return element;
}
