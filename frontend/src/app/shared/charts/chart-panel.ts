import { ChangeDetectionStrategy, Component, input, output, signal } from '@angular/core';
import { NgxEchartsDirective, provideEchartsCore } from 'ngx-echarts';
import type { ECharts, EChartsCoreOption } from 'echarts/core';

import { chartTokens } from './chart-tokens';
import type { ChartPointClick, ChartTable } from './chart-types';

/**
 * `ChartPanel` — the single charting surface every chart component renders into.
 *
 * Owns the framed card, the ECharts host element, the loading overlay, PNG
 * export, and the chart/table toggle. It takes a finished ECharts option;
 * building that option is the job of the typed wrappers (`BarChartComponent`,
 * `LineChartComponent`, …), which is what keeps those reusable without anyone
 * hand-writing ECharts config.
 *
 * Two deliberate deviations from the ngx-echarts README:
 *
 * 1. `provideEchartsCore` lives here, not in `app.config.ts`, and receives a
 *    loader function rather than a module. Both are required for ECharts to be
 *    code-split into a lazy chunk instead of the initial bundle.
 * 2. The directive's `[theme]` input is unused. The app ships one light
 *    palette; colours come from the design tokens via `chartTokens()`.
 */
@Component({
  selector: 'app-chart-panel',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [NgxEchartsDirective],
  providers: [
    provideEchartsCore({ echarts: () => import('./echarts-core').then((m) => m.default) }),
  ],
  template: `
    <figure class="rounded-lg border border-border bg-surface-raised max-sm:-mx-4 max-sm:rounded-none max-sm:border-x-0">
      @if (title() || subtitle() || table()) {
        <!--
          Stacked on narrow viewports: side-by-side squeezes a long title and a
          long subtitle into two cramped wrapped columns below roughly 640px.
        -->
        <figcaption
          class="flex flex-col gap-0.5 border-b border-border px-4 py-3 sm:flex-row sm:items-baseline sm:justify-between sm:gap-3"
        >
          <h3 class="text-sm font-medium text-text">{{ title() }}</h3>
          <div class="flex items-baseline gap-3">
            @if (subtitle()) {
              <p class="text-xs text-text-secondary">{{ subtitle() }}</p>
            }
            @if (table()) {
              <button
                type="button"
                class="shrink-0 rounded-md px-2 py-1 text-xs font-medium text-text-secondary underline underline-offset-2 hover:bg-surface-inset hover:text-text"
                [attr.aria-pressed]="showTable()"
                (click)="showTable.set(!showTable())"
              >
                {{ showTable() ? 'View as chart' : 'View as table' }}
              </button>
            }
          </div>
        </figcaption>
      }

      <div class="p-4">
        @if (showTable() && table(); as data) {
          <!-- Scrolls inside its own box so the page never scrolls sideways. -->
          <div class="overflow-x-auto" [style.max-height.px]="height()">
            <table class="w-full border-collapse text-left text-xs">
              <thead>
                <tr>
                  @for (col of data.columns; track col) {
                    <th
                      scope="col"
                      class="border-b border-border py-2 pr-4 font-medium whitespace-nowrap text-text-secondary"
                    >
                      {{ col }}
                    </th>
                  }
                </tr>
              </thead>
              <tbody>
                @for (row of data.rows; track $index) {
                  <tr>
                    @for (cell of row; track $index) {
                      @if ($first) {
                        <th
                          scope="row"
                          class="border-b border-border py-2 pr-4 font-normal whitespace-nowrap text-text"
                        >
                          {{ cell }}
                        </th>
                      } @else {
                        <td class="border-b border-border py-2 pr-4 tabular-nums text-text">
                          {{ cell }}
                        </td>
                      }
                    }
                  </tr>
                }
              </tbody>
            </table>
          </div>
        } @else {
          <div
            echarts
            role="img"
            class="w-full"
            [attr.aria-label]="ariaLabel() || title()"
            [attr.aria-busy]="loading() || null"
            [options]="options()"
            [loading]="loading()"
            [loadingOpts]="loadingOpts"
            [initOpts]="initOpts"
            [style.height.px]="height()"
            (chartInit)="chart.set($event)"
            (chartClick)="onChartClick($event)"
          ></div>
        }
      </div>
      <ng-content />
    </figure>
  `,
})
export class ChartPanelComponent {
  readonly title = input('');
  readonly subtitle = input('');
  /** Falls back to `title` when omitted; a chart with neither is unreadable to a screen reader. */
  readonly ariaLabel = input('');
  readonly options = input.required<EChartsCoreOption>();
  readonly loading = input(false);
  /**
   * Explicit pixel height. The directive silently forces `400px` on any host
   * whose computed height resolves to 0, which would override token sizing.
   */
  readonly height = input(320);
  /** Supplying this adds the "View as table" toggle. */
  readonly table = input<ChartTable | null>(null);

  /**
   * A click on a plotted datum. Clicks on empty canvas do not emit.
   *
   * Pointer-only by nature — a canvas has no focusable children — so a page
   * that makes this a way to select something must also offer a keyboard path
   * to the same selection.
   */
  readonly pointClicked = output<ChartPointClick>();

  protected readonly showTable = signal(false);

  /** Held as a signal so callers can await the async init before exporting. */
  protected readonly chart = signal<ECharts | null>(null);

  /**
   * Stable reference — a new object each render would re-init the chart.
   * Canvas rather than SVG so `exportPng()` can produce a real raster.
   */
  protected readonly initOpts = { renderer: 'canvas' };

  /** The overlay is drawn by ECharts, so it needs the palette passed in. */
  protected readonly loadingOpts = {
    text: 'Loading…',
    maskColor: 'rgba(255, 255, 255, 0.8)',
    textColor: chartTokens().textMuted,
    color: chartTokens().series[0],
  };

  protected onChartClick(event: {
    seriesName?: string;
    dataIndex?: number;
    name?: string;
  }): void {
    if (event.dataIndex === undefined) return;
    this.pointClicked.emit({
      seriesName: event.seriesName ?? '',
      dataIndex: event.dataIndex,
      name: event.name ?? '',
    });
  }

  /**
   * Raster snapshot for the "Export chart (PNG)" actions in docs 08 and 19.
   * Null before the async init resolves, or while the table view is showing.
   */
  exportPng(): string | null {
    return (
      this.chart()?.getDataURL({
        type: 'png',
        pixelRatio: 2,
        backgroundColor: chartTokens().surface,
      }) ?? null
    );
  }
}
