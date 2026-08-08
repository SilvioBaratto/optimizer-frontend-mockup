/** Shared input shapes for the chart components. Plain data — never ECharts options. */

/**
 * Tabular equivalent of a chart.
 *
 * Nearly every page spec requires a "View as table" alternative, and several
 * state outright that the drawing alone is inaccessible. On a phone it stops
 * being only an accessibility affordance and becomes the practical way to read
 * a dense figure, so every chart component supplies one.
 *
 * Cells are pre-formatted strings: the component already owns the value
 * formatter, and the table must show exactly what the chart shows.
 */
export interface ChartTable {
  columns: readonly string[];
  rows: readonly (readonly string[])[];
}

/** `(x, y)` pair for the XY-plane charts. */
export type Point = readonly [number, number];

/**
 * A click landing on a plotted datum.
 *
 * `dataIndex` is the position within that series' own data array, so a caller
 * that built the series from a list can map straight back to its element.
 */
export interface ChartPointClick {
  seriesName: string;
  dataIndex: number;
  /** The datum's name, when the series gives its points names. */
  name: string;
}

/** Formats a raw value for axis ticks, data labels and tooltips. */
export type ValueFormatter = (value: number) => string;

/** One series of values aligned to a shared category axis. */
export interface CategorySeries {
  name: string;
  /** `null` renders as a gap rather than zero — use it for "not measured". */
  data: readonly (number | null)[];
  /** Overrides the palette slot; use only when a series has fixed semantics. */
  color?: string;
  /**
   * Renders with a hatched fill to mark "not available", distinct from a zero
   * value. Docs 22 and 23 both require this distinction without relying on colour.
   */
  pattern?: boolean;
}

/** One series of free `(x, y)` points. */
export interface XySeries {
  name: string;
  points: readonly Point[];
  color?: string;
  /** ECharts symbol name — `circle`, `emptyCircle`, `triangle`, `diamond`, `rect`. */
  symbol?: string;
  symbolSize?: number;
  /** Draws a connecting line through the points, in series order. */
  line?: boolean;
  dashed?: boolean;
  /** Labels each point with its own name, for small annotated sets. */
  labels?: readonly string[];
}

/** Horizontal or vertical reference line, e.g. a χ² threshold or a MaxDD level. */
export interface RefLine {
  value: number;
  label?: string;
  /** Which axis the value sits on. `y` draws a horizontal line. Default `y`. */
  axis?: 'x' | 'y';
  color?: string;
  dashed?: boolean;
}

/** Shaded range, e.g. an outlier band or the λ<0 region of a histogram. */
export interface RefBand {
  from: number;
  to: number;
  label?: string;
  axis?: 'x' | 'y';
  color?: string;
}

/** Called-out single point, e.g. "current reading" or a peak event. */
export interface RefPoint {
  x: number | string;
  y: number;
  label?: string;
  color?: string;
}

/** A named marker on the risk-return plane. */
export interface FrontierMarker {
  name: string;
  x: number;
  y: number;
  /** Filled rather than hollow — reserved for the selected/tangency point. */
  emphasis?: boolean;
}

/** One bin of a histogram. */
export interface HistogramBin {
  label: string;
  value: number;
  /** Highlights this bin, e.g. the decile the current reading falls in. */
  highlight?: boolean;
}

/** One row of a bullet chart: a value positioned on a bounded track. */
export interface BulletRow {
  label: string;
  value: number;
  /** Lower bound tick. Omit for no tick. */
  min?: number;
  /** Upper bound tick. */
  max?: number;
  /** Text status shown after the value — never encode status in colour alone. */
  status?: string;
  color?: string;
}
