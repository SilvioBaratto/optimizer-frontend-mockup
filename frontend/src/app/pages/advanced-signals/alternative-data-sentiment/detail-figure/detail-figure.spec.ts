/**
 * The figure is different per kind of signal, and two of its conventions carry
 * meaning: a combination nobody estimated draws no bar and prints "not
 * reported", and the pairing in force is marked in the category label so it
 * survives into the table alternative and into greyscale.
 */

import { Component, input, signal } from '@angular/core';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import type { EChartsCoreOption } from 'echarts/core';

import type { AltSignalId, SignalDetailView } from '../../../../models/alt-data-sentiment.model';
import { AltDataSentimentService } from '../../../../services/alt-data-sentiment.service';
import { BarChartComponent, ChartPanelComponent } from '../../../../shared/charts';
import type { ChartTable } from '../../../../shared/charts';
import { AltDataDetailFigure } from './detail-figure';

@Component({
  selector: 'app-chart-panel',
  template: `
    <figure>
      <figcaption>
        <h3 data-testid="chart-title">{{ title() }}</h3>
        <p data-testid="chart-subtitle">{{ subtitle() }}</p>
      </figcaption>
      <div data-testid="chart-figure" role="img" [attr.aria-label]="ariaLabel() || title()"></div>
      @if (table(); as data) {
        <table data-testid="chart-table">
          <thead>
            <tr>
              @for (column of data.columns; track column) {
                <th>{{ column }}</th>
              }
            </tr>
          </thead>
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

  protected readonly unused = signal(false);
}

@Component({
  selector: 'app-figure-host',
  imports: [AltDataDetailFigure],
  template: `<app-alt-data-detail-figure [view]="view()" />`,
})
class FigureHost {
  readonly view = input.required<SignalDetailView>();
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

describe('AltDataDetailFigure', () => {
  let fixture: ComponentFixture<FigureHost>;
  let host: HTMLElement;
  let service: AltDataSentimentService;

  beforeAll(() => {
    installResizeObserver();
  });

  beforeEach(async () => {
    await TestBed.configureTestingModule({ imports: [FigureHost] })
      .overrideComponent(BarChartComponent, {
        remove: { imports: [ChartPanelComponent] },
        add: { imports: [ChartPanelStub] },
      })
      .compileComponents();

    service = TestBed.inject(AltDataSentimentService);
    fixture = TestBed.createComponent(FigureHost);
    host = fixture.nativeElement;
  });

  /** Renders the figure for one signal, as the detail panel would. */
  function show(id: AltSignalId): void {
    service.selectForDetail(id);
    fixture.componentRef.setInput('view', service.detail() as SignalDetailView);
    fixture.detectChanges();
  }

  function table(): string[][] {
    return Array.from(host.querySelectorAll('[data-testid="chart-table"] tbody tr')).map((row) =>
      Array.from(row.querySelectorAll('td')).map((cell) => cell.textContent?.trim() ?? ''),
    );
  }

  function ariaLabel(): string {
    return host.querySelector('[data-testid="chart-figure"]')?.getAttribute('aria-label') ?? '';
  }

  // --- the reversal profile --------------------------------------------------

  it('when the media pessimism figure renders, the reversal reads as three rows', () => {
    show('media-pessimism');

    expect(table()).toEqual([
      ['Day +1', '−8.1 bp'],
      ['Days 2–5', '+6.8 bp'],
      ['Cumulative', '−1.3 bp'],
    ]);
    expect(ariaLabel()).toContain('Cumulative −1.3 bp');
  });

  // --- the dictionary and weighting grid -------------------------------------

  it('when the tone figure renders, the pairing in force is marked in its own label', () => {
    show('tenk-tone');

    const rows = table();
    expect(rows[0][0]).toBe('● Fin-Neg · proportional');
    expect(rows[1][0]).toBe('○ H4N · tf.idf');
  });

  it('when a pairing was never estimated, its row says so rather than reading zero', () => {
    show('tenk-tone');

    const notReported = table().find((row) => row[0].includes('Fin-Neg · tf.idf'));
    expect(notReported?.[1]).toBe('not reported');
  });

  it('when the pairing changes, the mark moves with it', () => {
    show('tenk-tone');
    service.setToneDictionary('h4n');
    service.setToneWeighting('tfidf');
    fixture.componentRef.setInput('view', service.detail() as SignalDetailView);
    fixture.detectChanges();

    expect(table()[1][0]).toBe('● H4N · tf.idf');
    expect(table()[0][0]).toBe('○ Fin-Neg · proportional');
  });

  // --- the causality table ---------------------------------------------------

  it('when social mood is shown, the reading is a table of p-values by lag', () => {
    show('social-mood');

    expect(host.querySelector('[data-testid="chart-figure"]')).toBeNull();
    const rows = Array.from(host.querySelectorAll('[data-lag]'));
    expect(rows).toHaveLength(7);
    expect(rows[1].textContent).toContain('0.011');
    expect(rows[1].textContent).toContain('leads the index');
    expect(rows[0].textContent).toContain('no lead at this lag');
  });

  // --- the news cadence ------------------------------------------------------

  it('when news is aggregated daily, the figure stops where the predictability does', () => {
    show('news-analytics');

    expect(table()).toEqual([
      ['Day 1', '0.17%'],
      ['Day 2', '0.04%'],
    ]);
  });

  it('when news is aggregated weekly, the figure runs the full quarter', () => {
    show('news-analytics');
    service.setNewsAggregation('weekly');
    fixture.componentRef.setInput('view', service.detail() as SignalDetailView);
    fixture.detectChanges();

    const rows = table();
    expect(rows).toHaveLength(13);
    expect(rows[0]).toEqual(['Week 1', '3.75%']);
    expect(rows[12][0]).toBe('Week 13');
  });

  it('when one cadence is drawn, the other one is stated beside it', () => {
    show('news-analytics');

    const note = host.querySelector('[data-testid="ads-figure-note"]')?.textContent ?? '';
    expect(note).toContain('one to two days');
    expect(note).toContain('Aggregated weekly, the same articles predict for 13 weeks.');

    service.setNewsAggregation('weekly');
    fixture.componentRef.setInput('view', service.detail() as SignalDetailView);
    fixture.detectChanges();

    const weekly = host.querySelector('[data-testid="ads-figure-note"]')?.textContent ?? '';
    expect(weekly).toContain('13 weeks — a full quarter');
    expect(weekly).toContain('Aggregated daily, the same articles predict for one to two days');
  });

  // --- the loadings ----------------------------------------------------------

  it('when the aggregate index is shown, the lagged proxies are named as lagged', () => {
    show('aggregate-sentiment');

    const rows = table();
    expect(rows[0]).toEqual(['CEFD', '−0.241']);
    expect(rows[1][0]).toBe('TURN (t−1)');
    expect(rows[5]).toEqual(['PDND (t−1)', '−0.283']);
  });

  it('when the loadings are shown, the note names the index and its explained variance', () => {
    show('aggregate-sentiment');

    expect(host.querySelector('[data-testid="ads-figure-note"]')?.textContent).toContain(
      'SENT⊥ — the first principal component of the six proxies, explaining 53% of their variance.',
    );

    service.setSentimentBasis('sent');
    fixture.componentRef.setInput('view', service.detail() as SignalDetailView);
    fixture.detectChanges();

    expect(host.querySelector('[data-testid="ads-figure-note"]')?.textContent).toContain(
      'SENT — the first principal component of the six proxies, explaining 49% of their variance.',
    );
  });

  it('when the figure is a plain response profile, no note is invented for it', () => {
    show('media-pessimism');

    expect(host.querySelector('[data-testid="ads-figure-note"]')).toBeNull();
  });
});
