/**
 * The macro nowcast.
 *
 * Two claims are worth a test each. That the panel really is parallel to the
 * returns filter — nothing in it moves when the regime model or the universe
 * changes — and that a vintage older than the month the filter is anchored to
 * is announced in words, because a stale input to a comparison the reader is
 * being invited to make cannot be carried by a tint.
 */

import { Component, computed, input } from '@angular/core';
import { ComponentFixture, TestBed } from '@angular/core/testing';

import { MarketRegimesService } from '../../../../services/market-regimes.service';
import { BulletChartComponent } from '../../../../shared/charts';
import type { BulletRow, ValueFormatter } from '../../../../shared/charts';
import { MacroNowcast } from './macro-nowcast';

@Component({
  selector: 'app-bullet-chart',
  template: `
    <div [attr.data-aria-label]="ariaLabel()" [attr.data-chart-title]="title()">
      <span data-testid="chart-rows">{{ readings() }}</span>
      <ng-content />
    </div>
  `,
})
class BulletChartStub {
  readonly title = input('');
  readonly subtitle = input('');
  readonly ariaLabel = input('');
  readonly rows = input.required<readonly BulletRow[]>();
  readonly valueFormatter = input<ValueFormatter>((value) => String(value));
  readonly domainMin = input<number | undefined>(undefined);
  readonly domainMax = input<number | undefined>(undefined);
  readonly valueAxisName = input('');
  readonly height = input(320);

  /** Each row with its value and its status word, as the chart would print it. */
  protected readonly readings = computed(() => {
    const format = this.valueFormatter();
    return this.rows()
      .map((row) => `${row.label}=${format(row.value)} ${row.status}`)
      .join(' | ');
  });
}

describe('MacroNowcast', () => {
  let fixture: ComponentFixture<MacroNowcast>;
  let host: HTMLElement;
  let service: MarketRegimesService;

  beforeEach(async () => {
    await TestBed.configureTestingModule({ imports: [MacroNowcast] })
      .overrideComponent(MacroNowcast, {
        remove: { imports: [BulletChartComponent] },
        add: { imports: [BulletChartStub] },
      })
      .compileComponents();

    fixture = TestBed.createComponent(MacroNowcast);
    host = fixture.nativeElement;
    service = TestBed.inject(MarketRegimesService);
    fixture.detectChanges();
  });

  function text(testId: string): string {
    return host.querySelector(`[data-testid="${testId}"]`)?.textContent?.replace(/\s+/g, ' ').trim() ?? '';
  }

  function radio(label: string): HTMLButtonElement {
    const match = Array.from(host.querySelectorAll<HTMLButtonElement>('button[role="radio"]')).find(
      (button) => (button.textContent ?? '').trim() === label,
    );
    expect(match).toBeTruthy();
    return match as HTMLButtonElement;
  }

  async function settle(): Promise<void> {
    await service.settled();
    fixture.detectChanges();
  }

  // --- the reading ----------------------------------------------------------

  it('when the panel renders, the nowcast carries its vintage and its revision', () => {
    expect(text('mr-nowcast-gdp')).toBe('+1.4% q/q');
    expect(host.textContent).toContain('vintage 2026-07-28');
    expect(host.textContent).toContain('+0.2pp vs prior vintage 2026-07-21');
  });

  it('when the panel renders, each release carries the revision it caused with its sign', () => {
    const releases = Array.from(host.querySelectorAll('[data-testid="mr-releases"] li')).map((row) =>
      (row.textContent ?? '').replace(/\s+/g, ' ').trim(),
    );
    // Angular drops the whitespace-only nodes between the spans; the flex row's
    // own `gap` is what separates them on screen.
    expect(releases).toEqual([
      'Employment+0.15pp2026-07-27',
      'ISM survey+0.08pp2026-07-24',
      'Retail sales−0.03pp2026-07-22',
    ]);
  });

  // --- the factor count -----------------------------------------------------

  it('when the panel renders, six factors are selected and their blocks are named', () => {
    expect(radio('6 — 39% var.').getAttribute('aria-checked')).toBe('true');
    expect(text('mr-loadings')).toContain('production / employment · rate spreads · interest rates');
    expect(text('mr-loadings')).toContain('equity returns · inflation · construction');
  });

  it('when twelve factors are chosen, the extra band says the substance names no blocks for it', () => {
    radio('12 — 53% var.').click();
    fixture.detectChanges();

    expect(service.factorCount()).toBe(12);
    expect(text('mr-loadings')).toContain('Loadings, 7–12');
    expect(text('mr-loadings')).toContain('blocks not identified in the domain substance');
  });

  it('when the factor count changes, the uncertainty split moves with it', () => {
    expect(text('chart-rows')).toBe('Common factors=78% high | Idiosyncratic=26% low');

    radio('12 — 53% var.').click();
    fixture.detectChanges();

    expect(text('chart-rows')).toBe('Common factors=71% high | Idiosyncratic=31% low');
  });

  it('when the uncertainty is drawn, the label says both the share and the level in words', () => {
    const label = host.querySelector('[data-aria-label]')?.getAttribute('data-aria-label') ?? '';
    expect(label).toContain('the common factors carry 78%, which is high');
    expect(label).toContain('the idiosyncratic components 26%, which is low');
  });

  // --- the stale vintage ----------------------------------------------------

  it('when the vintage is current, no stale badge is shown', () => {
    expect(host.querySelector('[data-testid="mr-stale-vintage"]')).toBeNull();
  });

  it('when the filter is anchored past the vintage, the badge is text and names both dates', async () => {
    service.setSampleTo('2026-08');
    await settle();

    expect(text('mr-stale-vintage')).toContain('Stale vintage');
    expect(text('mr-stale-detail')).toContain('2026-07-28 is older than');
    expect(text('mr-stale-detail')).toContain('2026-08');
    expect(host.querySelector('[data-testid="mr-stale-detail"]')?.getAttribute('role')).toBe('status');
  });

  // --- parallel, never a substitute -----------------------------------------

  it('when the regime model or the universe changes, nothing in this panel moves', async () => {
    const before = text('chart-rows');

    service.setModel('hamilton');
    await settle();
    service.setUniverse('equities-only');
    await settle();

    expect(text('mr-nowcast-gdp')).toBe('+1.4% q/q');
    expect(text('chart-rows')).toBe(before);
    expect(host.textContent).toContain('Runs beside the returns filter and never replaces it');
  });
});
