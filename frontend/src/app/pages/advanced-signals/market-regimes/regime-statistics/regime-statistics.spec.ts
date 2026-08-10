/**
 * The regime statistics table.
 *
 * The cases below are almost all about the two correlation columns, because
 * that is where this region can do damage: a cell that prints a number the
 * domain substance never fixed, or a zero where the answer is "there is no such
 * pair in this universe", is a fabricated correlation dressed as a reading.
 * The three ways of saying "no number" are distinguished on purpose and are
 * asserted separately.
 */

import { ComponentFixture, TestBed } from '@angular/core/testing';

import { MarketRegimesService } from '../../../../services/market-regimes.service';
import { RegimeStatistics } from './regime-statistics';

describe('RegimeStatistics', () => {
  let fixture: ComponentFixture<RegimeStatistics>;
  let host: HTMLElement;
  let service: MarketRegimesService;

  beforeEach(async () => {
    await TestBed.configureTestingModule({ imports: [RegimeStatistics] }).compileComponents();

    fixture = TestBed.createComponent(RegimeStatistics);
    host = fixture.nativeElement;
    service = TestBed.inject(MarketRegimesService);
    fixture.detectChanges();
  });

  function regimes(): string[] {
    return Array.from(host.querySelectorAll('tbody tr')).map(
      (row) => row.querySelector('th')?.textContent?.trim() ?? '',
    );
  }

  function row(state: string): string[] {
    const cells = host.querySelectorAll(`tr[data-regime="${state}"] td`);
    return Array.from(cells).map((cell) => cell.textContent?.trim() ?? '');
  }

  function largeSmall(state: string): string {
    return host.querySelector(`[data-large-small="${state}"]`)?.textContent?.trim() ?? '';
  }

  function equityBond(state: string): string {
    return host.querySelector(`[data-equity-bond="${state}"]`)?.textContent?.trim() ?? '';
  }

  function legend(): string {
    return host.querySelector('[data-testid="mr-correlation-legend"]')?.textContent?.replace(/\s+/g, ' ').trim() ?? '';
  }

  async function settle(): Promise<void> {
    await service.settled();
    fixture.detectChanges();
  }

  // --- the shape of the table -----------------------------------------------

  it('when the table renders, it is headed by the universe it is computed on', () => {
    expect(host.querySelector('h2')?.textContent?.trim()).toBe(
      'Regime statistics · Equities + Bonds',
    );
    expect(host.querySelector('caption')?.textContent).toContain('conditional on the state');
  });

  it('when the table renders, one row per state carries the stationary law and the duration', () => {
    expect(regimes()).toEqual(['Crash', 'Slow Growth', 'Bull', 'Recovery']);
    expect(row('Crash').slice(0, 4)).toEqual(['9%', '2 mo', '−4.8%', '7.4%']);
    expect(row('Slow Growth').slice(0, 2)).toEqual(['40%', '7 mo']);
    expect(row('Bull').slice(0, 2)).toEqual(['28%', '8 mo']);
    expect(row('Recovery').slice(0, 2)).toEqual(['23%', '3 mo']);
  });

  // --- the correlation columns ----------------------------------------------

  it('when the substance fixes a correlation, the cell prints it', () => {
    expect(largeSmall('Crash')).toBe('0.82');
    expect(largeSmall('Recovery')).toBe('0.50');
    expect(equityBond('Crash')).toBe('−0.40');
  });

  it('when the substance fixes no magnitude for a regime, the cell says so and never guesses', () => {
    expect(largeSmall('Slow Growth')).toBe('—');
    expect(largeSmall('Bull')).toBe('—');
    expect(legend()).toContain('not fixed by the domain substance for this regime');
  });

  it('when the substance fixes only a sign, the cell prints the sign and not a number', () => {
    expect(equityBond('Slow Growth')).toBe('+ positive');
    expect(equityBond('Bull')).toBe('+ positive');
    expect(equityBond('Recovery')).toBe('+ positive');
    expect(legend()).toContain('magnitude not fixed');
  });

  it('when the universe has no equity-bond pair, that column reads n/d and never an estimate', async () => {
    service.setUniverse('equities-only');
    await settle();

    expect(equityBond('Crash')).toBe('n/d');
    expect(equityBond('Recovery')).toBe('n/d');
    // The size pair is still there, so it still carries its fixed values.
    expect(largeSmall('Crash')).toBe('0.82');
    expect(legend()).toContain('the selected universe has no such pair');
  });

  it('when the universe has no size pair, that column reads n/d and never an estimate', async () => {
    service.setUniverse('global-multi-asset');
    await settle();

    expect(largeSmall('Crash')).toBe('n/d');
    expect(largeSmall('Recovery')).toBe('n/d');
    expect(equityBond('Crash')).toBe('−0.40');
  });

  it('when the universe changes, the conditional moments move and the fixed correlations do not', async () => {
    expect(row('Crash')[2]).toBe('−4.8%');

    service.setUniverse('equities-only');
    await settle();

    expect(row('Crash')[2]).toBe('−6.1%');
    expect(largeSmall('Crash')).toBe('0.82');
  });

  // --- the model decides how many rows there are ----------------------------

  it('when the regime model drops to two states, the table drops to two rows', async () => {
    service.setModel('hamilton');
    await settle();

    expect(regimes()).toEqual(['Recession', 'Expansion']);
    // The correlations were never estimated over this taxonomy, and the table
    // says that rather than carrying the four-state numbers across.
    expect(largeSmall('Recession')).toBe('—');
    expect(equityBond('Expansion')).toBe('—');
  });

  // --- the empty combination ------------------------------------------------

  it('when no combination can be estimated, the table carries the same contextual message', async () => {
    service.setUniverse('em-equities');
    await settle();

    const empty = host.querySelector('[data-testid="mr-statistics-empty"]');
    expect(empty?.getAttribute('role')).toBe('status');
    expect(empty?.textContent).toContain('fewer than 24 months');
    expect(host.querySelector('tbody')).toBeNull();
  });
});
