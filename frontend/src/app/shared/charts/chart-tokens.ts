/**
 * ECharts draws to a canvas and cannot resolve CSS custom properties, so the
 * design tokens have to be read off `:root` once and handed over as literals.
 *
 * Tailwind v4's `@theme` block in `styles.css` emits every token onto `:root`,
 * which keeps that file the single source of truth — no colour is duplicated
 * here. The fallbacks exist only for unit tests, where no stylesheet is loaded.
 *
 * The app ships a single light palette. There is no dark variant, and charts
 * must not introduce one.
 */

export interface ChartTokens {
  /** Axis labels, data labels, anything that must read as primary text. */
  text: string;
  /** Axis names, secondary annotations. */
  textMuted: string;
  /** Axis lines and splitlines. */
  grid: string;
  /** Track behind a bar, and any inset fill. */
  track: string;
  /** Panel background — used when rasterising to PNG. */
  surface: string;
  /** Categorical palette, ordered for maximum separation between neighbours. */
  series: readonly string[];
  /** Gains, passing thresholds. */
  positive: string;
  /** Losses, breaches, hedges. */
  negative: string;
  /** Caution thresholds. */
  warning: string;
  /** Reference lines and neutral emphasis. */
  neutral: string;
}

const FALLBACK = {
  '--color-text': '#18181b',
  '--color-text-secondary': '#52525b',
  '--color-text-tertiary': '#6b7280',
  '--color-border': '#e4e4e7',
  '--color-surface-inset': '#f4f4f5',
  '--color-surface-raised': '#ffffff',
  '--color-primary': '#6d28d9',
  '--color-accent': '#4f46e5',
  '--color-signature': '#10b981',
  '--color-success': '#16a34a',
  '--color-danger': '#dc2626',
  '--color-warning': '#d97706',
  '--color-info': '#2563eb',
} as const;

let cache: ChartTokens | null = null;

function readTokens(): ChartTokens {
  const styles = typeof document !== 'undefined' ? getComputedStyle(document.documentElement) : null;
  const read = (name: keyof typeof FALLBACK): string =>
    styles?.getPropertyValue(name).trim() || FALLBACK[name];

  return {
    text: read('--color-text'),
    textMuted: read('--color-text-secondary'),
    grid: read('--color-border'),
    track: read('--color-surface-inset'),
    surface: read('--color-surface-raised'),
    series: [
      read('--color-primary'),
      read('--color-signature'),
      read('--color-warning'),
      read('--color-info'),
      read('--color-accent'),
      read('--color-text-tertiary'),
    ],
    positive: read('--color-success'),
    negative: read('--color-danger'),
    warning: read('--color-warning'),
    neutral: read('--color-text-tertiary'),
  };
}

/** Cached because every chart asks for it and the palette never changes at runtime. */
export function chartTokens(): ChartTokens {
  return (cache ??= readTokens());
}

/** Test seam — drops the cache so a suite can re-read after swapping styles. */
export function resetChartTokens(): void {
  cache = null;
}

/** Nth series colour, wrapping when a chart has more series than the palette. */
export function seriesColor(index: number): string {
  const { series } = chartTokens();
  return series[index % series.length];
}
