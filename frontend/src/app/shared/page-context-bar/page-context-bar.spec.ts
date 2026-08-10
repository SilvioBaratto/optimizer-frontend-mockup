import { Component, signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';

import { PageContextBar } from './page-context-bar';

// Signals rather than plain fields: the app runs zoneless, and reassigning a
// plain field between change-detection passes raises NG0100 rather than
// re-rendering.
@Component({
  imports: [PageContextBar],
  template: `
    <app-page-context-bar [heading]="heading()" [layout]="layout()" [compact]="compact()">
      <p>projected</p>
    </app-page-context-bar>
  `,
})
class HostComponent {
  readonly heading = signal('');
  readonly layout = signal<'stack' | 'row'>('stack');
  readonly compact = signal(false);
}

describe('PageContextBar', () => {
  let host: HTMLElement;
  let fixture: ReturnType<typeof TestBed.createComponent<HostComponent>>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({ imports: [HostComponent] }).compileComponents();
    fixture = TestBed.createComponent(HostComponent);
    host = fixture.nativeElement;
    fixture.detectChanges();
  });

  const bar = () => host.querySelector('app-page-context-bar') as HTMLElement;

  // --- stickiness ---
  //
  // These four assertions exist because the bar shipped for months with
  // `position: sticky` on its inner div, where it did nothing: a sticky box is
  // constrained by its containing block, and the inner div's containing block
  // is the host, which is exactly as tall as the bar. Measured on a real page,
  // scrolling 700px moved the bar from top 180 to top -520. Both halves of the
  // fix — position on the host, and a display that can be positioned at all —
  // are asserted, because either one alone is inert.

  it('when rendered, the host itself carries the sticky position', () => {
    expect(bar().classList.contains('sticky')).toBe(true);
  });

  it('when rendered, the host has an explicit block display so it can be positioned', () => {
    // A custom element defaults to display:inline, and an inline box ignores
    // top/z-index entirely.
    expect(bar().classList.contains('block')).toBe(true);
  });

  it('when rendered, the host is offset to the top of the scroll container', () => {
    expect(bar().classList.contains('top-0')).toBe(true);
  });

  it('when rendered, the inner surface does not also claim sticky', () => {
    // Two nested sticky boxes is the state that hid the bug: the outer one
    // looks correct in the markup while the inner one is the only one styled.
    const inner = bar().firstElementChild as HTMLElement;
    expect(inner.classList.contains('sticky')).toBe(false);
  });

  // --- content ---

  it('when content is projected, it renders inside the bar', () => {
    expect(bar().textContent).toContain('projected');
  });

  it('when a heading is given, it renders as a visually hidden h2', () => {
    fixture.componentInstance.heading.set('Run status');
    fixture.detectChanges();

    const h2 = bar().querySelector('h2');
    expect(h2?.textContent?.trim()).toBe('Run status');
    expect(h2?.classList.contains('sr-only')).toBe(true);
  });

  it('when no heading is given, no h2 renders', () => {
    expect(bar().querySelector('h2')).toBeNull();
  });

  // --- layout ---

  it('when layout is row, the surface lays its content out in a wrapping row', () => {
    fixture.componentInstance.layout.set('row');
    fixture.detectChanges();

    const inner = bar().firstElementChild as HTMLElement;
    expect(inner.classList.contains('flex')).toBe(true);
    expect(inner.classList.contains('flex-wrap')).toBe(true);
  });

  it('when layout is stack, the surface stacks its content', () => {
    const inner = bar().firstElementChild as HTMLElement;
    expect(inner.classList.contains('flex-col')).toBe(true);
  });

  it('when compact is set, the gap between stacked rows tightens', () => {
    const inner = () => bar().firstElementChild as HTMLElement;
    expect(inner().classList.contains('gap-3')).toBe(true);

    fixture.componentInstance.compact.set(true);
    fixture.detectChanges();

    expect(inner().classList.contains('gap-2')).toBe(true);
    expect(inner().classList.contains('gap-3')).toBe(false);
  });

  it('when rendered, the surface bleeds to the viewport edge', () => {
    // The bar is the one piece of page chrome that is not a card, so it cancels
    // the page gutter rather than sitting inside it.
    const inner = bar().firstElementChild as HTMLElement;
    expect(inner.classList.contains('-mx-4')).toBe(true);
    expect(inner.classList.contains('md:-mx-8')).toBe(true);
  });
});
