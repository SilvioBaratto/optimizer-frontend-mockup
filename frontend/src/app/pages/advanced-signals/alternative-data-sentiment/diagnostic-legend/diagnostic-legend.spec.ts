/**
 * The criterion card: framing, collapsible from the keyboard, with no threshold
 * of its own.
 */

import { ComponentFixture, TestBed } from '@angular/core/testing';

import { AltDataDiagnosticLegend } from './diagnostic-legend';

describe('AltDataDiagnosticLegend', () => {
  let fixture: ComponentFixture<AltDataDiagnosticLegend>;
  let host: HTMLElement;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [AltDataDiagnosticLegend],
    }).compileComponents();

    fixture = TestBed.createComponent(AltDataDiagnosticLegend);
    host = fixture.nativeElement;
    fixture.detectChanges();
  });

  function toggle(): HTMLButtonElement {
    return host.querySelector('[data-testid="ads-criterion-toggle"]') as HTMLButtonElement;
  }

  it('when the card renders, it states both poles of the criterion with their evidence', () => {
    expect(host.querySelector('[data-testid="ads-criterion-transient"]')?.textContent).toContain(
      '−8.1 bp',
    );
    expect(host.querySelector('[data-testid="ads-criterion-persistent"]')?.textContent).toContain(
      '13 weeks',
    );
  });

  it('when the card is collapsed, the control says so and the body goes away', () => {
    expect(toggle().getAttribute('aria-expanded')).toBe('true');

    toggle().click();
    fixture.detectChanges();

    expect(toggle().getAttribute('aria-expanded')).toBe('false');
    expect(host.querySelector('[data-testid="ads-criterion-transient"]')).toBeNull();
  });

  it('when the card is collapsed and reopened, the criterion comes back unchanged', () => {
    toggle().click();
    fixture.detectChanges();
    toggle().click();
    fixture.detectChanges();

    expect(toggle().getAttribute('aria-expanded')).toBe('true');
    expect(host.querySelector('[data-testid="ads-criterion-persistent"]')).not.toBeNull();
  });

  it('when the control is reached from the keyboard, it is a button rather than a styled div', () => {
    expect(toggle().tagName).toBe('BUTTON');
    expect(toggle().getAttribute('aria-controls')).toBe('ads-criterion-body');
  });
});
