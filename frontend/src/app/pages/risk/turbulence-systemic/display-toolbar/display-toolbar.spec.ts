/**
 * The toolbar, and the one thing it has to get right: both of its controls are
 * display controls. Neither reloads anything, and the line under them says so.
 */

import { ComponentFixture, TestBed } from '@angular/core/testing';

import { TurbulenceService } from '../../../../services/turbulence.service';
import { DisplayToolbar } from './display-toolbar';

describe('DisplayToolbar', () => {
  let fixture: ComponentFixture<DisplayToolbar>;
  let host: HTMLElement;
  let service: TurbulenceService;

  beforeEach(async () => {
    await TestBed.configureTestingModule({ imports: [DisplayToolbar] }).compileComponents();

    fixture = TestBed.createComponent(DisplayToolbar);
    host = fixture.nativeElement;
    service = TestBed.inject(TurbulenceService);
    document.body.appendChild(host);
    fixture.detectChanges();
  });

  afterEach(() => {
    host.remove();
  });

  function options(): HTMLButtonElement[] {
    return Array.from(host.querySelectorAll('[role="radiogroup"] button'));
  }

  function option(label: string): HTMLButtonElement {
    const match = options().find((button) => (button.textContent ?? '').trim() === label);
    expect(match).toBeTruthy();
    return match as HTMLButtonElement;
  }

  function toggle(): HTMLInputElement {
    return host.querySelector('[data-testid="threshold-toggle"]') as HTMLInputElement;
  }

  it('when the toolbar renders, the range is a named radiogroup defaulting to 1Y', () => {
    expect(host.querySelector('[role="radiogroup"]')?.getAttribute('aria-label')).toBe(
      'Chart display range',
    );
    expect(options().map((button) => (button.textContent ?? '').trim())).toEqual([
      '6M',
      '1Y',
      '3Y',
      '5Y',
      'Max',
    ]);
    expect(option('1Y').getAttribute('aria-checked')).toBe('true');
  });

  it('when a range is chosen, the service records it and nothing enters a loading state', () => {
    option('6M').click();
    fixture.detectChanges();

    expect(service.displayRange()).toBe('6M');
    expect(option('6M').getAttribute('aria-checked')).toBe('true');
    expect(service.state()).toBe('ready');
  });

  it('when a range is chosen, the estimation windows are untouched', () => {
    const before = service.windows();
    option('Max').click();
    fixture.detectChanges();

    expect(service.windows()).toEqual(before);
  });

  it('when the overlay toggle is cleared, the threshold and bands are hidden without a reload', () => {
    expect(toggle().checked).toBe(true);

    toggle().checked = false;
    toggle().dispatchEvent(new Event('change'));
    fixture.detectChanges();

    expect(service.showThresholdAndBands()).toBe(false);
    expect(service.state()).toBe('ready');
  });

  it('when the toolbar renders, it states that the range moves no window and no reading', () => {
    expect(host.textContent).toContain(
      'The estimation windows and the current readings do not move with it.',
    );
  });
});
