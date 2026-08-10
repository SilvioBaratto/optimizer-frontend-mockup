/**
 * The four jump links: real anchors, keyboard-operable, and inert as far as the
 * data is concerned.
 */

import { ComponentFixture, TestBed } from '@angular/core/testing';

import type { TurbulenceSection } from '../../../../models/turbulence.model';
import { SectionNav } from './section-nav';

describe('SectionNav', () => {
  let fixture: ComponentFixture<SectionNav>;
  let host: HTMLElement;
  let jumped: TurbulenceSection[];

  beforeEach(async () => {
    await TestBed.configureTestingModule({ imports: [SectionNav] }).compileComponents();

    fixture = TestBed.createComponent(SectionNav);
    host = fixture.nativeElement;
    jumped = [];
    fixture.componentInstance.jump.subscribe((section) => jumped.push(section));
    document.body.appendChild(host);
    fixture.detectChanges();
  });

  afterEach(() => {
    host.remove();
  });

  function links(): HTMLAnchorElement[] {
    return Array.from(host.querySelectorAll('a'));
  }

  it('when the nav renders, it is a named landmark holding the four sections in order', () => {
    const nav = host.querySelector('nav');
    expect(nav?.getAttribute('aria-label')).toBe('Page sections');
    expect(links().map((link) => (link.textContent ?? '').trim())).toEqual([
      'Turbulence',
      'Compactness',
      'PC1 Growth',
      'Correlation Structure',
    ]);
  });

  it('when the nav renders, each link points at the anchor of its own section', () => {
    expect(links().map((link) => link.getAttribute('href'))).toEqual([
      '#section-turbulence',
      '#section-compactness',
      '#section-pc1-growth',
      '#section-correlation-structure',
    ]);
  });

  it('when a link is activated, the default navigation is prevented and the section is emitted', () => {
    const event = new MouseEvent('click', { bubbles: true, cancelable: true });
    links()[2].dispatchEvent(event);

    expect(event.defaultPrevented).toBe(true);
    expect(jumped).toEqual(['pc1-growth']);
  });

  it('when a link is reached by keyboard, it is a real anchor so Enter activates it', () => {
    // Anchors with an href are in the tab order and turn Enter into a click;
    // the component adds no keydown handler that could take that away.
    for (const link of links()) {
      expect(link.hasAttribute('href')).toBe(true);
      expect(link.hasAttribute('tabindex')).toBe(false);
    }

    links()[0].click();
    expect(jumped).toEqual(['turbulence']);
  });

  it('when a section is current, only that link says so', () => {
    fixture.componentRef.setInput('current', 'compactness');
    fixture.detectChanges();

    expect(links().map((link) => link.getAttribute('aria-current'))).toEqual([
      null,
      'true',
      null,
      null,
    ]);
  });
});
