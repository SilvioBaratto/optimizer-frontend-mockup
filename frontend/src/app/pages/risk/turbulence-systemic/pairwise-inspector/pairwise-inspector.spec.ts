/**
 * The pairwise inspector.
 *
 * Two rules: the measure is defined for a pair, so `X = Y` is refused and the
 * panel says why; and every number in the readout satisfies the closed form for
 * the `z_x`, `z_y` and `ρ` printed beside it — the failure the doc's second
 * blocking review names.
 */

import { Component, computed, input } from '@angular/core';
import { ComponentFixture, TestBed } from '@angular/core/testing';

import type { BulletRow, ValueFormatter } from '../../../../shared/charts';
import { BulletChartComponent } from '../../../../shared/charts';
import { TurbulenceService } from '../../../../services/turbulence.service';
import { PairwiseInspector } from './pairwise-inspector';

@Component({
  selector: 'app-bullet-chart',
  template: `
    <div [attr.data-aria-label]="ariaLabel()" [attr.data-chart-title]="title()">
      <span data-testid="bullet-row">{{ row() }}</span>
      <span data-testid="bullet-domain">{{ domain() }}</span>
      <ng-content />
    </div>
  `,
})
class BulletChartStub {
  readonly title = input('');
  readonly subtitle = input('');
  readonly ariaLabel = input('');
  readonly rows = input.required<readonly BulletRow[]>();
  readonly mode = input<'fill' | 'marker'>('fill');
  readonly domainMin = input<number | undefined>(undefined);
  readonly domainMax = input<number | undefined>(undefined);
  readonly valueFormatter = input<ValueFormatter>((value) => String(value));
  readonly valueAxisName = input('');
  readonly height = input(320);

  protected readonly row = computed(() => {
    const row = this.rows()[0];
    if (!row) return '';
    return `${row.label}=${row.value.toFixed(4)} [${row.min?.toFixed(4)}, ${row.max?.toFixed(4)}] ${row.status}`;
  });
  protected readonly domain = computed(
    () => `${this.domainMin()?.toFixed(4)}..${this.domainMax()?.toFixed(4)}`,
  );
}

describe('PairwiseInspector', () => {
  let fixture: ComponentFixture<PairwiseInspector>;
  let host: HTMLElement;
  let service: TurbulenceService;

  beforeEach(async () => {
    await TestBed.configureTestingModule({ imports: [PairwiseInspector] })
      .overrideComponent(PairwiseInspector, {
        remove: { imports: [BulletChartComponent] },
        add: { imports: [BulletChartStub] },
      })
      .compileComponents();

    fixture = TestBed.createComponent(PairwiseInspector);
    host = fixture.nativeElement;
    service = TestBed.inject(TurbulenceService);
    document.body.appendChild(host);
    fixture.detectChanges();
  });

  afterEach(() => {
    host.remove();
  });

  function testId(id: string): string {
    return (host.querySelector(`[data-testid="${id}"]`)?.textContent ?? '').trim();
  }

  function select(side: 'x' | 'y'): HTMLSelectElement {
    return host.querySelector(`[data-testid="pair-${side}"]`) as HTMLSelectElement;
  }

  function choose(side: 'x' | 'y', value: string): void {
    const element = select(side);
    element.value = value;
    element.dispatchEvent(new Event('change'));
    fixture.detectChanges();
  }

  // --- defaults --------------------------------------------------------------

  it('when the panel renders, the pair is the first two assets in alphabetical order', () => {
    expect(select('x').value).toBe('EQ_ASIA_PAC');
    expect(select('y').value).toBe('EQ_EM');
    expect(select('x').value).not.toBe(select('y').value);
  });

  it('when the panel renders, each selector has a visible label and a search field of its own', () => {
    expect(host.querySelector('label[for="ts-pair-x"]')?.textContent?.trim()).toBe('Asset X');
    expect(host.querySelector('label[for="ts-pair-y"]')?.textContent?.trim()).toBe('Asset Y');
    expect(host.querySelector('[data-testid="pair-x-search"]')).not.toBeNull();
    expect(host.querySelector('[data-testid="pair-y-search"]')).not.toBeNull();
  });

  // --- the formula -----------------------------------------------------------

  it('when a pair is chosen, the surprise and its bounds satisfy the closed form', () => {
    choose('x', 'EQ_US_LARGE');
    choose('y', 'HY_CREDIT');

    const zX = 1.9;
    const zY = 2.2;
    const rho = 0.42;
    const expected = (1 - (rho * zX * zY) / ((zX * zX + zY * zY) / 2)) / (1 - rho * rho);
    const min = (1 - rho) / (1 - rho * rho);
    const max = (1 + rho) / (1 - rho * rho);

    expect(testId('pair-zx')).toBe('1.90');
    expect(testId('pair-zy')).toBe('2.20');
    expect(testId('pair-rho')).toBe('0.42');
    expect(testId('pair-cs')).toContain(expected.toFixed(2));
    expect(testId('pair-cs')).toContain(`${min.toFixed(2)} min`);
    expect(testId('pair-cs')).toContain(`${max.toFixed(2)} max`);
    expect(expected).toBeCloseTo(0.71, 2);
    expect(min).toBeCloseTo(0.7, 2);
    expect(max).toBeCloseTo(1.72, 2);
  });

  it('when the surprise is drawn, the track runs between the bounds the correlation allows', () => {
    const pair = service.pairwise();
    expect(testId('bullet-domain')).toBe(`${pair.min.toFixed(4)}..${pair.max.toFixed(4)}`);
    expect(testId('bullet-row')).toBe(
      `${pair.assetX} vs ${pair.assetY}=${pair.correlationSurprise.toFixed(4)} ` +
        `[${pair.min.toFixed(4)}, ${pair.max.toFixed(4)}] ` +
        `${pair.correlationSurprise > 1 ? 'above one' : 'below one'}`,
    );
  });

  // --- X ≠ Y -----------------------------------------------------------------

  it('when the same asset is chosen for both sides, the choice is refused and announced', () => {
    choose('y', 'EQ_ASIA_PAC');

    expect(service.assetY()).toBe('EQ_EM');
    expect(select('y').value).toBe('EQ_EM');
    expect(testId('pair-note')).toContain('Asset X must differ from Asset Y.');
    expect(host.querySelector('[data-testid="pair-note"]')?.getAttribute('role')).toBe('alert');
  });

  it('when the refusal comes from the other side, it is refused there too', () => {
    choose('x', 'EQ_EM');

    expect(service.assetX()).toBe('EQ_ASIA_PAC');
    expect(select('x').value).toBe('EQ_ASIA_PAC');
    expect(testId('pair-note')).toContain('Asset X must differ from Asset Y.');
  });

  it('when a valid pair follows a refused one, the note clears', () => {
    choose('y', 'EQ_ASIA_PAC');
    expect(testId('pair-note')).not.toBe('');

    choose('y', 'GOLD');
    expect(testId('pair-note')).toBe('');
    expect(service.assetY()).toBe('GOLD');
  });

  it('when the panel renders, it states that a single asset has no correlation surprise', () => {
    expect(testId('pair-only-note')).toContain(
      'Defined for a pair only — a single asset has no correlation surprise',
    );
  });

  // --- the search ------------------------------------------------------------

  it('when the search narrows the list, the current selection stays in it', () => {
    const input = host.querySelector('[data-testid="pair-x-search"]') as HTMLInputElement;
    input.value = 'gov';
    input.dispatchEvent(new Event('input'));
    fixture.detectChanges();

    const options = Array.from(select('x').options).map((option) => option.value);
    expect(options).toContain('GOV_10Y');
    expect(options).toContain('EQ_ASIA_PAC');
    expect(options).not.toContain('OIL_BRENT');
    expect(select('x').value).toBe('EQ_ASIA_PAC');
  });

  // --- 320px -----------------------------------------------------------------

  it('when the panel is laid out, the selector cells can shrink below their widest option', () => {
    // A grid item's `min-width` is `auto` and a `<select>`'s min-content width
    // is its widest option — "EQ_US_LARGE — US large cap equity". Without
    // `min-w-0` on the cell the single-column track is sized to that string and
    // the whole document scrolls sideways at 320px; measured at 20px of page
    // overflow before this. `appSelect` sets no width of its own.
    for (const side of ['x', 'y'] as const) {
      const control = select(side);
      const cell = control.parentElement as HTMLElement;
      expect(cell.className).toContain('min-w-0');
      expect(control.className).toContain('w-full');
      expect(
        (host.querySelector(`[data-testid="pair-${side}-search"]`) as HTMLElement).className,
      ).toContain('w-full');
    }
  });

  // --- accessibility and failure ---------------------------------------------

  it('when the panel renders, its label carries the pair, the inputs and the verdict', () => {
    const label = host.querySelector('[data-aria-label]')?.getAttribute('data-aria-label') ?? '';
    expect(label).toContain('EQ_ASIA_PAC against EQ_EM');
    expect(label).toContain('historical rho');
    expect(label).toContain('The measure is defined for a pair only.');
  });

  it('when the computation fails, the panel shows the pair-specific fault', async () => {
    await service.refreshPanel('pairwise', true);
    fixture.detectChanges();

    expect(host.querySelector('[data-aria-label]')).toBeNull();
    expect(host.textContent).toContain('no overlapping observations inside the correlation window');
  });
});
