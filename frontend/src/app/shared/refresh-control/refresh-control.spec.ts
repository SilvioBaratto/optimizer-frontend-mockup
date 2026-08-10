import { Component, signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';

import { RefreshControl } from './refresh-control';

// Signals rather than plain fields: the app runs zoneless, and reassigning a
// plain field between change-detection passes raises NG0100.
@Component({
  imports: [RefreshControl],
  template: `
    <app-refresh-control [label]="label()" [busy]="busy()" (refresh)="count.set(count() + 1)" />
  `,
})
class HostComponent {
  readonly label = signal('Refresh');
  readonly busy = signal(false);
  readonly count = signal(0);
}

describe('RefreshControl', () => {
  let host: HTMLElement;
  let fixture: ReturnType<typeof TestBed.createComponent<HostComponent>>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({ imports: [HostComponent] }).compileComponents();
    fixture = TestBed.createComponent(HostComponent);
    host = fixture.nativeElement;
    document.body.appendChild(host);
    fixture.detectChanges();
  });

  afterEach(() => host.remove());

  const button = () => host.querySelector('button') as HTMLButtonElement;

  it('when the label is given, it renders', () => {
    fixture.componentInstance.label.set('Refresh signals');
    fixture.detectChanges();
    expect(button().textContent).toContain('Refresh signals');
  });

  it('when pressed, it asks for a refresh', () => {
    button().click();
    expect(fixture.componentInstance.count()).toBe(1);
  });

  // --- the busy state ---
  //
  // This control is the button that STARTS the read which then sets `busy`, so
  // the reader pressing it is standing on the element being disabled. Using the
  // `disabled` attribute here drops focus to <body> for the whole read and the
  // next Tab restarts at the top of the document. Eleven pages use this
  // component, so the behaviour is asserted rather than left to inspection.

  it('when busy, the button keeps the focus the reader was holding', () => {
    button().focus();
    expect(document.activeElement).toBe(button());

    fixture.componentInstance.busy.set(true);
    fixture.detectChanges();

    expect(document.activeElement).toBe(button());
  });

  it('when busy, it is marked aria-disabled rather than disabled', () => {
    fixture.componentInstance.busy.set(true);
    fixture.detectChanges();

    expect(button().getAttribute('aria-disabled')).toBe('true');
    expect(button().disabled).toBe(false);
  });

  it('when busy, it announces that it is busy', () => {
    fixture.componentInstance.busy.set(true);
    fixture.detectChanges();
    expect(button().getAttribute('aria-busy')).toBe('true');
  });

  it('when busy, a second press is refused', () => {
    fixture.componentInstance.busy.set(true);
    fixture.detectChanges();

    button().click();

    expect(fixture.componentInstance.count()).toBe(0);
  });

  it('when the read finishes, it accepts presses again', () => {
    fixture.componentInstance.busy.set(true);
    fixture.detectChanges();
    button().click();

    fixture.componentInstance.busy.set(false);
    fixture.detectChanges();
    button().click();

    expect(fixture.componentInstance.count()).toBe(1);
  });

  it('when idle, it carries neither busy nor disabled state', () => {
    expect(button().getAttribute('aria-disabled')).toBeNull();
    expect(button().getAttribute('aria-busy')).toBeNull();
  });
});
