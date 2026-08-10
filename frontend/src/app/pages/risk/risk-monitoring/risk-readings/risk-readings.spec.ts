/**
 * The four current readings.
 *
 * What is checked here is that each card says what produced it — the level, the
 * method and the horizon are in the label, the units are on the figure — and
 * that a sample too thin for the historical estimate is reported rather than
 * quietly repaired.
 */

import { ComponentFixture, TestBed } from '@angular/core/testing';

import { RiskMonitoringService } from '../../../../services/risk-monitoring.service';
import { RiskReadings } from './risk-readings';

describe('RiskReadings', () => {
  let fixture: ComponentFixture<RiskReadings>;
  let host: HTMLElement;
  let service: RiskMonitoringService;

  beforeEach(async () => {
    await TestBed.configureTestingModule({ imports: [RiskReadings] }).compileComponents();

    fixture = TestBed.createComponent(RiskReadings);
    host = fixture.nativeElement;
    service = TestBed.inject(RiskMonitoringService);
    document.body.appendChild(host);
    fixture.detectChanges();
  });

  afterEach(() => {
    host.remove();
  });

  function labels(): string[] {
    return Array.from(host.querySelectorAll('dt')).map((el) => el.textContent?.trim() ?? '');
  }

  function values(): string[] {
    return Array.from(host.querySelectorAll('[data-testid="metric-value"]')).map(
      (el) => el.textContent?.trim() ?? '',
    );
  }

  /** Re-renders after a change the service loads for. */
  async function settle(): Promise<void> {
    await service.settled();
    fixture.detectChanges();
  }

  it('when the readings render, the four figures are a description list', () => {
    expect(host.querySelectorAll('dl')).toHaveLength(1);
    expect(labels()).toEqual([
      'VaR (95%, hist., 1D)',
      'CVaR / ES (95%)',
      'Current drawdown',
      'Time underwater',
    ]);
    expect(values()).toEqual(['3.42% of NAV', '4.87% of NAV', '−6.1% (rel.)', '47 days']);
  });

  it('when the readings render, VaR is never the larger of the two', () => {
    const [varReading, cvarReading] = values().map((value) => Number.parseFloat(value));
    expect(varReading).toBeLessThanOrEqual(cvarReading);
  });

  it('when the readings render, the CVaR card carries the ordering as words', () => {
    expect(host.textContent).toContain('VaR ≤ CVaR');
    expect(host.querySelector('[data-testid="order-note"]')?.textContent).toContain(
      'CVaR averages the losses beyond the VaR threshold',
    );
  });

  it('when the level, method or horizon changes, the label says so', async () => {
    service.setHoldingPeriod(5);
    await settle();
    expect(labels()[0]).toBe('VaR (95%, hist., 5D)');

    service.setMethod('parametric');
    await settle();
    expect(labels()[0]).toBe('VaR (95%, param., 5D)');

    service.setConfidence(90);
    await settle();
    expect(labels()[0]).toBe('VaR (90%, param., 5D)');
    expect(labels()[1]).toBe('CVaR / ES (90%)');
  });

  it('when the holding period lengthens, the measures grow with the square root of time', async () => {
    const before = Number.parseFloat(values()[0]);
    service.setHoldingPeriod(10);
    await settle();

    const after = Number.parseFloat(values()[0]);
    expect(after / before).toBeCloseTo(Math.sqrt(10), 2);
  });

  it('when the units switch to Abs, the same fall is restated against the capital base', () => {
    service.setDrawdownUnits('abs');
    fixture.detectChanges();

    expect(values()[2]).toBe('−€15.3m (abs.)');
    // The tail measures are shares of NAV and are not a drawdown: untouched.
    expect(values()[0]).toBe('3.42% of NAV');
  });

  it('when the readings render, the drawdown card names the high it fell from', () => {
    const note = Array.from(host.querySelectorAll('[data-testid="metric-note"]'))[2];
    expect(note?.textContent).toContain('From the running maximum of');
  });

  it('when the historical sample is too thin, the card is flagged and the way out is named', async () => {
    service.setConfidence(99);
    await settle();

    const note = host.querySelector('[data-testid="insufficient-history"]');
    expect(note?.getAttribute('role')).toBe('status');
    expect(note?.textContent).toContain('fewer than 5');
    expect(note?.textContent).toContain('Switch Method to Parametric');
    expect(host.textContent).toContain('Short sample');
    // Flagged, not repaired: the label still names the method that ran.
    expect(labels()[0]).toBe('VaR (99%, hist., 1D)');
  });

  it('when the historical sample is too thin, the VaR card itself names the way out', async () => {
    service.setConfidence(99);
    await settle();

    // The doc puts the note *on* the card. A badge reading "Short sample" says
    // the figure is suspect but not what to do about it, and the sentence under
    // the row is a live region rather than part of the card a reader lands on.
    const note = Array.from(host.querySelectorAll('[data-testid="metric-note"]'))[0];
    expect(note?.textContent).toContain('switch Method to Parametric');
  });

  it('when the sample is long enough, the VaR card names no way out of it', () => {
    const note = Array.from(host.querySelectorAll('[data-testid="metric-note"]'))[0];
    expect(note?.textContent).toContain('12 of 252 observations');
    expect(note?.textContent).not.toContain('Parametric');
  });

  it('when the parametric method is chosen, no sample-size warning is raised', async () => {
    service.setConfidence(99);
    await settle();
    service.setMethod('parametric');
    await settle();

    expect(host.querySelector('[data-testid="insufficient-history"]')).toBeNull();
    expect(host.textContent).toContain('no sample-size floor');
  });
});
