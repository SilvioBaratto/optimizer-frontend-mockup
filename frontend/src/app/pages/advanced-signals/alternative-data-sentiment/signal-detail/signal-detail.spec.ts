/**
 * The detail panel: the method controls write straight through, the
 * classification is recomputed from the evidence rather than looked up, and the
 * one include control lives here.
 *
 * Only the chart *panel* is stubbed — ECharts wants a canvas and a
 * `ResizeObserver`, and jsdom has neither. `BarChartComponent` is the real one,
 * so the categories, the series, the accessible label and the table alternative
 * are all built by production code.
 */

import { Component, input, signal } from '@angular/core';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import type { EChartsCoreOption } from 'echarts/core';

import { AltDataSentimentService } from '../../../../services/alt-data-sentiment.service';
import { BarChartComponent, ChartPanelComponent } from '../../../../shared/charts';
import type { ChartTable } from '../../../../shared/charts';
import { AltDataSignalDetail } from './signal-detail';

/** Everything `app-chart-panel` gives a reader, minus the canvas. */
@Component({
  selector: 'app-chart-panel',
  template: `
    <figure>
      <figcaption>
        <h3>{{ title() }}</h3>
        <p data-testid="chart-subtitle">{{ subtitle() }}</p>
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

  protected readonly showTable = signal(true);
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

describe('AltDataSignalDetail', () => {
  let fixture: ComponentFixture<AltDataSignalDetail>;
  let host: HTMLElement;
  let service: AltDataSentimentService;

  beforeAll(() => {
    installResizeObserver();
  });

  beforeEach(async () => {
    await TestBed.configureTestingModule({ imports: [AltDataSignalDetail] })
      .overrideComponent(BarChartComponent, {
        remove: { imports: [ChartPanelComponent] },
        add: { imports: [ChartPanelStub] },
      })
      .compileComponents();

    fixture = TestBed.createComponent(AltDataSignalDetail);
    host = fixture.nativeElement;
    service = TestBed.inject(AltDataSentimentService);
    document.body.appendChild(host);
    fixture.detectChanges();
  });

  afterEach(() => {
    host.remove();
  });

  function text(testId: string): string {
    return host.querySelector(`[data-testid="${testId}"]`)?.textContent?.replace(/\s+/g, ' ').trim() ?? '';
  }

  function segment(testId: string, label: string): HTMLButtonElement {
    const control = host.querySelector(`[data-testid="${testId}"]`);
    const match = Array.from(control?.querySelectorAll<HTMLButtonElement>('button') ?? []).find(
      (button) => button.textContent?.trim().startsWith(label),
    );
    expect(match).toBeTruthy();
    return match as HTMLButtonElement;
  }

  // --- the expanded card -----------------------------------------------------

  it('when the panel opens, it shows the card driving it with its coverage and classification', () => {
    const card = host.querySelector('[data-testid="ads-selected-card"]')?.textContent ?? '';
    expect(card).toContain('Text tone');
    expect(card).toContain('cov. 74%');
    expect(card).toContain('updated 2026-07-30');
    expect(card).toContain('Transient');
  });

  // --- the method controls, with no save step --------------------------------

  it('when the dictionary changes, the figure and the verdict follow with no save step', () => {
    expect(text('chart-subtitle')).toContain('Fin-Neg');
    expect(text('ads-detail-verdict')).toContain('t = −2.64');

    segment('ads-tone-dictionary', 'Harvard H4N').click();
    fixture.detectChanges();

    expect(text('chart-subtitle')).toContain('H4N');
    expect(text('ads-detail-verdict')).toContain('t = −0.71');
    expect(text('ads-detail-verdict')).toContain('not distinct from zero');
    expect(host.querySelector('button[data-testid="ads-apply-method"]')).toBeNull();
  });

  it('when the weighting changes, the same pairing rule decides what is shown', () => {
    segment('ads-tone-weighting', 'tf.idf').click();
    fixture.detectChanges();

    expect(text('chart-subtitle')).toContain('not reported');
    expect(text('ads-detail-verdict')).toContain('not reported by the evidence');
  });

  it('when a pairing was never estimated, the table alternative says so rather than printing zero', () => {
    segment('ads-tone-weighting', 'tf.idf').click();
    fixture.detectChanges();

    const table = host.querySelector('[data-testid="chart-table"]')?.textContent ?? '';
    expect(table).toContain('not reported');
    expect(table).not.toContain('0.00');
  });

  it('when the Harvard dictionary is chosen, the misclassification caution appears with it', () => {
    expect(host.querySelector('[data-testid="ads-h4n-note"]')).toBeNull();

    segment('ads-tone-dictionary', 'Harvard H4N').click();
    fixture.detectChanges();

    expect(text('ads-h4n-note')).toContain('73.8%');

    segment('ads-tone-dictionary', 'Fin-Neg').click();
    fixture.detectChanges();

    expect(host.querySelector('[data-testid="ads-h4n-note"]')).toBeNull();
  });

  it('when news is aggregated weekly, the panel reclassifies it and the library entry does not', () => {
    service.selectForDetail('news-analytics');
    fixture.detectChanges();
    expect(text('chart-subtitle')).toContain('Transient');

    segment('ads-news-aggregation', 'Weekly').click();
    fixture.detectChanges();

    expect(text('chart-subtitle')).toContain('Persistent');
    expect(text('ads-detail-verdict')).toContain('13 weeks');
    expect(service.signalById('news-analytics')?.temporal).toBe('mixed');
  });

  // --- inclusion -------------------------------------------------------------

  it('when the include checkbox is ticked, the card is included and still drives the panel', () => {
    const checkbox = host.querySelector('[data-testid="ads-include-checkbox"]') as HTMLInputElement;
    expect(checkbox.checked).toBe(false);

    checkbox.click();
    fixture.detectChanges();

    expect(service.isIncluded('tenk-tone')).toBe(true);
    expect(service.detailSignalId()).toBe('tenk-tone');
  });

  // --- the methodology panel -------------------------------------------------

  it('when the methodology is opened, it names the method currently in force', () => {
    (host.querySelector('[data-testid="ads-view-methodology"]') as HTMLButtonElement).click();
    fixture.detectChanges();

    expect(text('ads-methodology-heading')).toContain('10-K Tone');
    expect(text('ads-methodology-method')).toContain('Fin-Neg');
  });

  // --- the bridge to the next tab --------------------------------------------

  it('when the aggregate index is shown, its cross-sectional evidence is one press away', () => {
    service.selectForDetail('aggregate-sentiment');
    fixture.detectChanges();

    const link = host.querySelector('[data-testid="ads-open-cross-sectional"]') as HTMLButtonElement;
    expect(link).not.toBeNull();

    const asked: number[] = [];
    fixture.componentInstance.crossSectionalRequested.subscribe(() => asked.push(1));

    link.click();
    fixture.detectChanges();

    // The switch is asked for, not made here: it destroys this component, and
    // with it the button just pressed, so the page has to own the focus move.
    expect(asked).toHaveLength(1);
    expect(service.tab()).toBe('signal-library');
  });

  // --- focus -----------------------------------------------------------------

  it('when the selection is moved from the keyboard, the panel heading can take focus', () => {
    const heading = host.querySelector('#ads-detail-heading') as HTMLElement;
    expect(heading.getAttribute('tabindex')).toBe('-1');

    heading.focus();

    expect(document.activeElement).toBe(heading);
  });

  // --- the empty panel -------------------------------------------------------

  it('when no signal is available at all, the panel invites a selection rather than going blank', async () => {
    service.setUniverse('em-frontier-small');
    await service.settled();
    fixture.detectChanges();

    expect(host.querySelector('[data-testid="ads-detail-empty"]')).not.toBeNull();
  });
});
