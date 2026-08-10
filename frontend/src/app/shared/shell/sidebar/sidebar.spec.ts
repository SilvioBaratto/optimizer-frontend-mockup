import { ComponentFixture, TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';

import { ICON_PROVIDER } from '../../../icons';
import { Shell } from '../shell';

/**
 * The drawer, exercised through the real `Shell`.
 *
 * The defect this covers was an output that existed, was bound, and was simply
 * never emitted by one of the links. A fixture rendering `Sidebar` alone would
 * have to listen for the emission it is testing for; going through `Shell`
 * asks the question a reader would — is the menu still covering the page? —
 * against the shell's own state.
 */
describe('Sidebar drawer', () => {
  let fixture: ComponentFixture<Shell>;
  let shell: HTMLElement;

  const burger = () =>
    shell.querySelector('app-shell-topbar button[aria-controls="shell-sidebar"]') as HTMLElement;
  const backdrop = () => shell.querySelector('div[aria-hidden="true"].fixed');
  const isOpen = () => burger().getAttribute('aria-expanded') === 'true';

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      providers: [provideRouter([{ path: '**', children: [] }]), ICON_PROVIDER],
    }).compileComponents();

    // `Shell` reads `window.innerWidth` in its constructor; jsdom reports 1024,
    // and above `md` there is no drawer to close.
    Object.defineProperty(window, 'innerWidth', { value: 390, configurable: true });

    fixture = TestBed.createComponent(Shell);
    fixture.detectChanges();
    shell = fixture.nativeElement as HTMLElement;

    burger().click();
    fixture.detectChanges();

    // A drawer is only a drawer while it is open over the page.
    expect(isOpen()).toBe(true);
    expect(backdrop()).not.toBeNull();
  });

  it('when a section row in the open drawer is followed, the drawer closes behind it', () => {
    (shell.querySelector('app-shell-sidebar a[href="/dashboard"]') as HTMLAnchorElement).click();
    fixture.detectChanges();

    expect(isOpen()).toBe(false);
    expect(backdrop()).toBeNull();
  });

  it('when the brand in the open drawer is followed, the drawer closes behind it', () => {
    // The brand was the one link in here that reported nothing. Measured at
    // 390x844: it moved the router to /dashboard while the drawer stayed open
    // over the new page, the backdrop stayed up and the scroll lock stayed on
    // the root — the page changed underneath a menu the reader could not see
    // past and could not scroll away.
    (shell.querySelector('app-shell-sidebar a[href="/"]') as HTMLAnchorElement).click();
    fixture.detectChanges();

    expect(isOpen()).toBe(false);
    expect(backdrop()).toBeNull();
  });
});
