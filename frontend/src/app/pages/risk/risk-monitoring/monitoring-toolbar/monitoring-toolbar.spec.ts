/**
 * The toolbar, and the one thing it has to get right: three of its controls
 * cost a calculation and three do not. A toolbar that reloaded the page to
 * change a unit, or changed β without reloading, would be lying about what the
 * figures beneath it are.
 */

import { ComponentFixture, TestBed } from '@angular/core/testing';

import { RiskMonitoringService } from '../../../../services/risk-monitoring.service';
import { MonitoringToolbar } from './monitoring-toolbar';

describe('MonitoringToolbar', () => {
  let fixture: ComponentFixture<MonitoringToolbar>;
  let host: HTMLElement;
  let service: RiskMonitoringService;

  beforeEach(async () => {
    await TestBed.configureTestingModule({ imports: [MonitoringToolbar] }).compileComponents();

    fixture = TestBed.createComponent(MonitoringToolbar);
    host = fixture.nativeElement;
    service = TestBed.inject(RiskMonitoringService);
    document.body.appendChild(host);
    fixture.detectChanges();
  });

  afterEach(() => {
    host.remove();
  });

  function buttons(): HTMLButtonElement[] {
    return Array.from(host.querySelectorAll('button'));
  }

  function option(label: string): HTMLButtonElement {
    const match = buttons().find((b) => (b.textContent ?? '').trim() === label);
    expect(match).toBeTruthy();
    return match as HTMLButtonElement;
  }

  function stamp(): string {
    return host.querySelector('[data-testid="as-of"]')?.textContent?.trim() ?? '';
  }

  function select(id: string): HTMLSelectElement {
    return host.querySelector(`#${id}`) as HTMLSelectElement;
  }

  function choose(element: HTMLSelectElement, value: string): void {
    element.value = value;
    element.dispatchEvent(new Event('change'));
    fixture.detectChanges();
  }

  // --- shape ----------------------------------------------------------------

  it('when the toolbar renders, the three toggles are named radiogroups', () => {
    const groups = Array.from(host.querySelectorAll('[role="radiogroup"]')).map((group) =>
      group.getAttribute('aria-label'),
    );
    expect(groups).toEqual(['Confidence level', 'VaR method', 'Drawdown units']);
  });

  it('when the toolbar renders, each select is labelled by a real label element', () => {
    for (const id of ['rm-holding-period', 'rm-lookback']) {
      const label = host.querySelector(`label[for="${id}"]`);
      expect(label?.textContent?.trim()).toBeTruthy();
      expect(select(id)).not.toBeNull();
    }
  });

  it('when the toolbar renders, the defaults are the ones the spec sets', () => {
    expect(option('95%').getAttribute('aria-checked')).toBe('true');
    expect(option('Historical').getAttribute('aria-checked')).toBe('true');
    expect(option('Rel%').getAttribute('aria-checked')).toBe('true');
    expect(select('rm-holding-period').value).toBe('1');
    expect(select('rm-lookback').value).toBe('1Y');
  });

  it('when the toolbar renders, the as-of stamp is read-only text, not a field', () => {
    expect(stamp()).toContain('As of 2026-07-31 16:45 UTC');
    expect(host.querySelectorAll('input')).toHaveLength(0);
  });

  // --- the controls that cost a calculation ---------------------------------

  it('when the confidence level changes, the measures are recomputed', async () => {
    option('90%').click();
    fixture.detectChanges();

    expect(select('rm-holding-period').disabled).toBe(true);

    await service.settled();
    fixture.detectChanges();

    expect(option('90%').getAttribute('aria-checked')).toBe('true');
    expect(stamp()).toContain('16:46 UTC');
  });

  it('when the method changes, the measures are recomputed', async () => {
    option('Parametric').click();
    fixture.detectChanges();
    await service.settled();
    fixture.detectChanges();

    expect(option('Parametric').getAttribute('aria-checked')).toBe('true');
    expect(stamp()).toContain('16:46 UTC');
  });

  it('when the holding period changes, the measures are recomputed', async () => {
    choose(select('rm-holding-period'), '10');
    await service.settled();
    fixture.detectChanges();

    expect(select('rm-holding-period').value).toBe('10');
    expect(stamp()).toContain('16:46 UTC');
  });

  it('when the refresh control is used, the calculation re-runs on the current parameters', async () => {
    const refresh = buttons().find((b) => (b.textContent ?? '').includes('Refresh'))!;
    refresh.click();
    fixture.detectChanges();

    // aria-disabled, not disabled: this is the button that started the read, so
    // disabling it would drop the reader's focus to <body> for the duration.
    expect(refresh.getAttribute('aria-disabled')).toBe('true');
    expect(refresh.disabled).toBe(false);
    expect(refresh.getAttribute('aria-busy')).toBe('true');

    await new Promise((resolve) => setTimeout(resolve, 800));
    fixture.detectChanges();

    expect(stamp()).toContain('16:46 UTC');
    expect(option('95%').getAttribute('aria-checked')).toBe('true');
  });

  // --- the controls that cost nothing ---------------------------------------

  it('when the lookback window changes, no calculation is started', () => {
    choose(select('rm-lookback'), '3M');

    expect(select('rm-lookback').value).toBe('3M');
    expect(select('rm-holding-period').disabled).toBe(false);
    expect(stamp()).toContain('16:45 UTC');
  });

  it('when the drawdown units change, no calculation is started', () => {
    option('Abs').click();
    fixture.detectChanges();

    expect(option('Abs').getAttribute('aria-checked')).toBe('true');
    expect(select('rm-lookback').disabled).toBe(false);
    expect(stamp()).toContain('16:45 UTC');
  });

  // --- while a calculation is in flight -------------------------------------

  it('while a calculation runs, every control stays visible and refuses input', async () => {
    const pending = service.refresh();
    fixture.detectChanges();

    for (const label of ['90%', '95%', '99%', 'Parametric', 'Historical', 'Abs', 'Rel%']) {
      expect(option(label).getAttribute('aria-disabled')).toBe('true');
    }
    expect(select('rm-holding-period').disabled).toBe(true);
    expect(select('rm-lookback').disabled).toBe(true);

    // Disabled, not removed: the reason travels with the option.
    expect(host.textContent).toContain('Unavailable while the risk measures are being recomputed.');

    await pending;
    fixture.detectChanges();
    expect(option('99%').getAttribute('aria-disabled')).toBeNull();
  });

  it('while a calculation runs, a second change to the same control starts no second run', async () => {
    const pending = service.refresh();
    fixture.detectChanges();

    option('99%').click();
    fixture.detectChanges();

    await pending;
    fixture.detectChanges();

    // One completed run, so one minute on the stamp — not two.
    expect(stamp()).toContain('16:46 UTC');
    expect(option('95%').getAttribute('aria-checked')).toBe('true');
  });
});
