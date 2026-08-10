/**
 * The CDaR curve and its α slider.
 *
 * The endpoints are the whole reason this region exists — `Δ₀(x) = AvDD` and
 * `Δ₁(x) = MaxDD` — so the tests care most about reaching them exactly, from
 * the keyboard, and about the readout and the marker agreeing once you are
 * there. The slider is also the page's one ARIA-heavy control, and its
 * announcement is a reading, not a number.
 */

import { Component, computed, input } from '@angular/core';
import { ComponentFixture, TestBed } from '@angular/core/testing';

import { RiskMonitoringService } from '../../../../services/risk-monitoring.service';
import { LineChartComponent } from '../../../../shared/charts';
import type { CategorySeries, RefPoint, ValueFormatter } from '../../../../shared/charts';
import { CdarCurve } from './cdar-curve';

@Component({
  selector: 'app-line-chart',
  template: `
    <div [attr.data-aria-label]="ariaLabel()">
      <span data-testid="chart-series">{{ summary() }}</span>
      <span data-testid="chart-points">{{ points() }}</span>
      <ng-content />
    </div>
  `,
})
class LineChartStub {
  readonly title = input('');
  readonly subtitle = input('');
  readonly ariaLabel = input('');
  readonly x = input.required<readonly (string | number)[]>();
  readonly series = input.required<readonly CategorySeries[]>();
  readonly refPoints = input<readonly RefPoint[]>([]);
  readonly valueFormatter = input<ValueFormatter>((value) => String(value));
  readonly xAxisName = input('');
  readonly yAxisName = input('');
  readonly height = input(320);
  readonly scaleY = input(true);

  protected readonly summary = computed(() => {
    const format = this.valueFormatter();
    const data = this.series()[0]?.data ?? [];
    const x = this.x();
    return `${x[0]}=${format(data[0] ?? 0)} … ${x[x.length - 1]}=${format(data[data.length - 1] ?? 0)} (${data.length} samples)`;
  });

  protected readonly points = computed(() =>
    this.refPoints()
      .map((point) => `${point.x}:${point.label ?? ''}`)
      .join(' | '),
  );
}

describe('CdarCurve', () => {
  let fixture: ComponentFixture<CdarCurve>;
  let host: HTMLElement;
  let service: RiskMonitoringService;

  beforeEach(async () => {
    await TestBed.configureTestingModule({ imports: [CdarCurve] })
      .overrideComponent(CdarCurve, {
        remove: { imports: [LineChartComponent] },
        add: { imports: [LineChartStub] },
      })
      .compileComponents();

    fixture = TestBed.createComponent(CdarCurve);
    host = fixture.nativeElement;
    service = TestBed.inject(RiskMonitoringService);
    document.body.appendChild(host);
    fixture.detectChanges();
  });

  afterEach(() => {
    host.remove();
  });

  function slider(): HTMLInputElement {
    return host.querySelector('#rm-cdar-alpha') as HTMLInputElement;
  }

  function press(key: string, init: KeyboardEventInit = {}): KeyboardEvent {
    const event = new KeyboardEvent('keydown', { key, bubbles: true, cancelable: true, ...init });
    slider().dispatchEvent(event);
    fixture.detectChanges();
    return event;
  }

  function readout(): string {
    return host.querySelector('[data-testid="cdar-readout"]')?.textContent?.trim() ?? '';
  }

  function points(): string {
    return host.querySelector('[data-testid="chart-points"]')?.textContent ?? '';
  }

  /** What the control reports it is on, as a screen reader would read it. */
  function alphaNow(): string {
    return slider().getAttribute('aria-valuenow') ?? '';
  }

  // --- the control ----------------------------------------------------------

  it('when the region renders, the slider is a range input with a label', () => {
    expect(slider().type).toBe('range');
    expect(host.querySelector('label[for="rm-cdar-alpha"]')?.textContent).toContain(
      'CDaR confidence level alpha',
    );
    expect(slider().min).toBe('0');
    expect(slider().max).toBe('1');
    expect(slider().step).toBe('0.01');
  });

  it('when the region renders, the slider announces its range and its reading', () => {
    expect(slider().getAttribute('aria-valuemin')).toBe('0');
    expect(slider().getAttribute('aria-valuemax')).toBe('1');
    expect(slider().getAttribute('aria-valuenow')).toBe('0.95');
    expect(slider().getAttribute('aria-valuetext')).toBe('α = 0.95, Δ = 9.8%');
  });

  it('when the region renders, the readout names the level it was read at', () => {
    expect(readout()).toBe('Δ_0.95(x) = 9.8%');
    expect(host.querySelector('[data-testid="cdar-alpha"]')?.textContent?.trim()).toBe('0.95');
  });

  // --- reaching the ends ----------------------------------------------------

  it('when End is pressed, α is exactly 1 and Δ is the maximum drawdown', () => {
    press('End');

    expect(alphaNow()).toBe('1');
    expect(readout()).toBe('Δ_1.00(x) = 18.4%');
    expect(slider().getAttribute('aria-valuetext')).toBe('α = 1.00, Δ = 18.4%');
    expect(points()).toContain('1.00:Δ_1.00(x) = 18.4% = MaxDD');
  });

  it('when Home is pressed, α is exactly 0 and Δ is the average drawdown', () => {
    press('Home');

    expect(alphaNow()).toBe('0');
    expect(readout()).toBe('Δ_0.00(x) = 7.2%');
    expect(points()).toContain('0.00:Δ_0.00(x) = 7.2% = AvDD');
  });

  it('when α is at an end, only one mark is drawn on that coordinate', () => {
    press('End');
    // The endpoint and the marker are the same point; two dots on one coord
    // would be two labels fighting for the same pixel.
    expect(points().split('|')).toHaveLength(2);
    expect(points()).toContain('0.00:Δ₀ = AvDD 7.2%');
  });

  it('when α is between the ends, both ends stay labelled as what they are', () => {
    expect(points()).toContain('0.00:Δ₀ = AvDD 7.2%');
    expect(points()).toContain('0.95:Δ_0.95(x) = 9.8%');
    expect(points()).toContain('1.00:Δ₁ = MaxDD 18.4%');
  });

  // --- stepping -------------------------------------------------------------

  it('when an arrow key is pressed, α steps by one hundredth in that direction', () => {
    press('ArrowRight');
    expect(alphaNow()).toBe('0.96');
    press('ArrowLeft');
    expect(alphaNow()).toBe('0.95');
    press('ArrowUp');
    expect(alphaNow()).toBe('0.96');
    press('ArrowDown');
    // Repeated stepping in binary drifts; the readout must not start twitching.
    expect(alphaNow()).toBe('0.95');
    expect(readout()).toBe('Δ_0.95(x) = 9.8%');
  });

  it('when Page keys are pressed, α jumps by ten steps and stops at the end', () => {
    press('PageUp');
    expect(alphaNow()).toBe('1');
    press('PageDown');
    expect(alphaNow()).toBe('0.9');
    expect(readout()).toContain('Δ_0.90(x)');
  });

  it('when a key the slider owns is pressed, the browser does not step it a second time', () => {
    expect(press('ArrowRight').defaultPrevented).toBe(true);
    expect(press('End').defaultPrevented).toBe(true);
    // Tab and modified arrows belong to somebody else.
    expect(press('Tab').defaultPrevented).toBe(false);
    expect(press('ArrowLeft', { metaKey: true }).defaultPrevented).toBe(false);
  });

  it('when the handle is dragged, the readout follows it', () => {
    slider().value = '0.4';
    slider().dispatchEvent(new Event('input'));
    fixture.detectChanges();

    expect(alphaNow()).toBe('0.4');
    expect(readout()).toContain('Δ_0.40(x)');
    expect(points()).toContain('0.40:Δ_0.40(x)');
  });

  // --- the figure -----------------------------------------------------------

  it('when the curve renders, it is sampled across the whole of the range', () => {
    expect(host.querySelector('[data-testid="chart-series"]')?.textContent).toBe(
      '0.00=7.2% … 1.00=18.4% (101 samples)',
    );
  });

  it('when the curve renders, its label states the identity at both ends', () => {
    const label = host.querySelector('[data-aria-label]')?.getAttribute('data-aria-label') ?? '';
    expect(label).toContain('Δ₀ is 7.2%, the average drawdown');
    expect(label).toContain('Δ₁ is 18.4%, the maximum drawdown');
    expect(label).toContain('α = 0.95 the reading is 9.8%');
    expect(host.textContent).toContain('Δ₀(x) = AvDD · Δ₁(x) = MaxDD');
  });

  it('when the units switch to Abs, the readout and the curve restate in money', () => {
    service.setDrawdownUnits('abs');
    fixture.detectChanges();

    expect(readout()).toBe('Δ_0.95(x) = €24.5m');
    expect(slider().getAttribute('aria-valuetext')).toBe('α = 0.95, Δ = €24.5m');
    expect(host.querySelector('[data-testid="chart-series"]')?.textContent).toContain(
      '0.00=€18.0m … 1.00=€46.0m',
    );
  });

  it('when another region points at this figure, the mark is said in words', () => {
    fixture.componentRef.setInput('highlight', 'Δ_0.95(x) = 9.8% against a 14.0% limit');
    fixture.detectChanges();

    const caption = host.querySelector('[data-testid="cdar-highlight"]');
    expect(caption?.getAttribute('role')).toBe('status');
    expect(caption?.textContent).toContain('Δ_0.95(x) = 9.8% against a 14.0% limit');
  });
});
