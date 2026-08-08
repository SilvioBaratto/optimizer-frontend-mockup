/**
 * Charting surface for the app.
 *
 * Import components from here rather than reaching into individual files, so
 * pages depend on the public shape of this folder and not its layout.
 *
 * Which component for which figure:
 * - `BarChartComponent` — grouped, stacked and diverging category bars
 * - `LineChartComponent` — time series, area, stacked bands, log axis
 * - `ScatterChartComponent` — free XY points, one symbol per series
 * - `FrontierChartComponent` — risk-return plane with CAL and named markers
 * - `HistogramChartComponent` — binned distribution with a highlighted region
 * - `BulletChartComponent` — value on a bounded track (replaces a linear gauge)
 *
 * All six render through `ChartPanelComponent` and share the inputs on
 * `ChartBase` (title, subtitle, ariaLabel, loading, height, optionPatch) plus
 * an `exportPng()` method.
 *
 * The app has one light palette; charts read it from the design tokens and
 * must not add a dark variant.
 */
export { ChartPanelComponent } from './chart-panel';
export { ChartBase } from './chart-base';

export { BarChartComponent } from './bar-chart';
export { LineChartComponent } from './line-chart';
export { ScatterChartComponent } from './scatter-chart';
export { FrontierChartComponent } from './frontier-chart';
export { HistogramChartComponent } from './histogram-chart';
export { BulletChartComponent } from './bullet-chart';

export { basisPoints, decimal, percent } from './chart-options';
export { chartTokens, resetChartTokens, seriesColor } from './chart-tokens';
export type { ChartTokens } from './chart-tokens';

export type {
  BulletRow,
  CategorySeries,
  ChartPointClick,
  ChartTable,
  FrontierMarker,
  HistogramBin,
  Point,
  RefBand,
  RefLine,
  RefPoint,
  ValueFormatter,
  XySeries,
} from './chart-types';
