/**
 * The key-risk-factor figure, and the one finding it exists to state: the
 * contributions do not sum to 100%, and the *sign* of the shortfall is the
 * whole content of the chart. It has to be readable as a sentence, because a
 * reader comparing four bar lengths against an invisible total cannot see it.
 *
 * Only the chart panel is stubbed; `BarChartComponent` is the real one, so the
 * bars, the reference line and the "View as table" alternative are production
 * output.
 */

import { Component, input, signal } from '@angular/core';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import type { EChartsCoreOption } from 'echarts/core';

import {
  FACTOR_INTERACTION_NOTE,
  LOSS_CONTRIBUTION_NOTE,
  STALE_RESULT_BADGE,
} from '../../../../models/stress-testing.model';
import { StressTestingService } from '../../../../services/stress-testing.service';
import { BarChartComponent, ChartPanelComponent } from '../../../../shared/charts';
import type { ChartTable, RefLine } from '../../../../shared/charts';
import { LossContributions } from './loss-contributions';

@Component({
  selector: 'app-chart-panel',
  template: `
    <figure>
      <figcaption>
        <h3>{{ title() }}</h3>
        @if (table()) {
          <button type="button" (click)="toggle()">
            {{ showTable() ? 'View as chart' : 'View as table' }}
          </button>
        }
      </figcaption>
      <div data-testid="chart-figure" role="img" [attr.aria-label]="ariaLabel() || title()">
        @if (showTable() && table(); as data) {
          <table data-testid="chart-table">
            <tbody>
              @for (row of data.rows; track $index) {
                <tr>
                  @for (cell of row; track $index) {
                    <td>{{ cell }}</td>
                  }
                </tr>
              }
            </tbody>
          </table>
        }
      </div>
      <ng-content />
    </figure>
  `,
})
class ChartPanelStub {
  readonly title = input('');
  readonly subtitle = input('');
  readonly ariaLabel = input('');
  readonly options = input.required<EChartsCoreOption>();
  readonly loading = input(false);
  readonly height = input(320);
  readonly table = input<ChartTable | null>(null);

  protected readonly showTable = signal(false);

  protected toggle(): void {
    this.showTable.set(!this.showTable());
  }
}

function installResizeObserver(): void {
  if ('ResizeObserver' in globalThis) return;
  (globalThis as unknown as Record<string, unknown>)['ResizeObserver'] = class {
    observe(): void {
      /* no layout to observe */
    }
    unobserve(): void {
      /* no layout to observe */
    }
    disconnect(): void {
      /* no layout to observe */
    }
  };
}

describe('LossContributions', () => {
  let fixture: ComponentFixture<LossContributions>;
  let host: HTMLElement;
  let service: StressTestingService;

  beforeAll(() => {
    installResizeObserver();
  });

  beforeEach(async () => {
    await TestBed.configureTestingModule({ imports: [LossContributions] })
      .overrideComponent(BarChartComponent, {
        remove: { imports: [ChartPanelComponent] },
        add: { imports: [ChartPanelStub] },
      })
      .compileComponents();

    fixture = TestBed.createComponent(LossContributions);
    host = fixture.nativeElement;
    service = TestBed.inject(StressTestingService);
    document.body.appendChild(host);
    fixture.detectChanges();
  });

  afterEach(() => {
    host.remove();
  });

  function byTestId(id: string): HTMLElement | null {
    return host.querySelector(`[data-testid="${id}"]`);
  }

  function text(id: string): string {
    return byTestId(id)?.textContent?.replace(/\s+/g, ' ').trim() ?? '';
  }

  function detailsButton(): HTMLButtonElement {
    return byTestId('mlc-details') as HTMLButtonElement;
  }

  async function search(): Promise<void> {
    await service.runWorstCase();
    fixture.detectChanges();
  }

  // --- the empty state -------------------------------------------------------

  it('when no search has run, the figure is empty and says what would fill it', () => {
    expect(host.textContent).toContain('No maximum-loss contributions yet.');
    expect(byTestId('chart-figure')).toBeNull();
    expect(byTestId('mlc-interaction')).toBeNull();
  });

  // --- the finding, in words -------------------------------------------------

  it('when the search has run, the sum and the sign of the interaction are a sentence', async () => {
    await search();

    expect(text('mlc-interaction')).toContain(
      'Sum MLC 92.0% (< 100%) — negative interaction between factors',
    );
    expect(text('mlc-interaction-note')).toBe(FACTOR_INTERACTION_NOTE['negative']);
    // The dangerous direction is spelled out, not left to the bars.
    expect(text('mlc-interaction-note')).toContain('larger than the sum of the losses');
  });

  it('when the contributions are ranked, only the key factors are named as drivers', async () => {
    await search();

    expect(text('mlc-drivers')).toContain('FX EUR/USD 68.4%');
    expect(text('mlc-drivers')).toContain('Equity market 17.9%');
    expect(text('mlc-drivers')).not.toContain('Credit spread');
    expect(text('mlc-drivers')).toContain('10.0%');
  });

  it('when the figure is read by a screen reader, the label carries the ranking and the finding', async () => {
    await search();

    const label = byTestId('chart-figure')?.getAttribute('aria-label') ?? '';
    expect(label).toContain('FX EUR/USD 68.4%');
    expect(label).toContain('Rate 10Y (dom.) 1.5%');
    expect(label).toContain('Sum MLC 92.0% (< 100%) — negative interaction between factors');
    expect(label).toContain('key risk factors are FX EUR/USD and Equity market');
  });

  it('when the figure is read as a table, the shares are the ones computed, not rescaled', async () => {
    await search();
    const toggle = Array.from(host.querySelectorAll('button')).find((b) =>
      (b.textContent ?? '').includes('View as table'),
    )!;
    toggle.click();
    fixture.detectChanges();

    const table = byTestId('chart-table')?.textContent ?? '';
    expect(table).toContain('68.4%');
    expect(table).toContain('17.9%');
    expect(table).toContain('4.2%');
    expect(table).toContain('1.5%');
  });

  it('when the search has run, the key-factor threshold is drawn as a labelled reference', async () => {
    await search();

    const chart = fixture.debugElement.query((node) => node.name === 'app-bar-chart');
    const lines = chart.componentInstance.refLines() as readonly RefLine[];
    expect(lines).toHaveLength(1);
    expect(lines[0].value).toBe(10);
    expect(lines[0].label).toContain('key risk factor');
  });

  // --- the detail panel ------------------------------------------------------

  it('when Details is opened, the per-factor arithmetic is shown without leaving the page', async () => {
    await search();
    detailsButton().focus();
    detailsButton().click();
    fixture.detectChanges();
    await fixture.whenStable();

    const panel = host.querySelector('#stress-mlc-detail');
    expect(panel).not.toBeNull();
    expect(panel?.textContent).toContain('LC(i, r_WC)');
    expect(panel?.textContent).toContain('key risk factor');
    expect(panel?.textContent).toContain(LOSS_CONTRIBUTION_NOTE);
    expect(text('mlc-detail-sum')).toBe('92.0%');
    expect(host.querySelectorAll('[data-contribution]')).toHaveLength(4);
  });

  it('when the detail panel is closed with Escape, focus returns to the link that opened it', async () => {
    await search();
    detailsButton().focus();
    detailsButton().click();
    fixture.detectChanges();
    await fixture.whenStable();

    const dialog = host.querySelector('[role="dialog"]')!;
    dialog.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
    fixture.detectChanges();
    await fixture.whenStable();

    expect(host.querySelector('#stress-mlc-detail')).toBeNull();
    expect(document.activeElement).toBe(detailsButton());
  });

  // --- the central rule ------------------------------------------------------

  it('when a parameter moves, the figure is badged stale and the shares do not move', async () => {
    await search();
    const sentence = text('mlc-interaction');

    service.setImpactMeasure('economic-capital');
    fixture.detectChanges();

    expect(text('mlc-interaction')).toBe(sentence);
    expect(byTestId('mlc-stale')?.textContent).toContain(STALE_RESULT_BADGE);
  });

  // --- loading ---------------------------------------------------------------

  it('while the search runs, the figure is a placeholder', async () => {
    await search();
    const pending = service.runWorstCase();
    fixture.detectChanges();

    expect(byTestId('mlc-skeleton')?.getAttribute('aria-busy')).toBe('true');
    expect(byTestId('chart-figure')).toBeNull();

    await pending;
    fixture.detectChanges();
    expect(byTestId('chart-figure')).not.toBeNull();
  });
});
