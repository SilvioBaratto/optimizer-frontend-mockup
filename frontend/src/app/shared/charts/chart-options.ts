/**
 * Shared ECharts option fragments.
 *
 * Every chart component composes these so grids, axes, tooltips and reference
 * marks look identical across all 49 charts in the specs. Component-specific
 * option code should stay limited to its `series`.
 */
import { chartTokens } from './chart-tokens';
import type { RefBand, RefLine, RefPoint, ValueFormatter } from './chart-types';

/** Percent with one decimal — the most common unit across the specs. */
export const percent: ValueFormatter = (v) => `${v.toFixed(1)}%`;
/** Plain number with up to two decimals, trailing zeros dropped. */
export const decimal: ValueFormatter = (v) => String(Math.round(v * 100) / 100);
/** Basis points. */
export const basisPoints: ValueFormatter = (v) => `${v > 0 ? '+' : ''}${Math.round(v)}bp`;

export function baseGrid(extra: Record<string, unknown> = {}): Record<string, unknown> {
  // No `containLabel`: ECharts 6 fits axis labels automatically and warns when
  // the deprecated option is present without LegacyGridContainLabel.
  return { left: 12, right: 20, top: 24, bottom: 12, ...extra };
}

export function baseTooltip(extra: Record<string, unknown> = {}): Record<string, unknown> {
  const t = chartTokens();
  return {
    backgroundColor: t.surface,
    borderColor: t.grid,
    borderWidth: 1,
    padding: [6, 10],
    // Keeps the tooltip inside the chart box. Unconfined it spills out of the
    // card on narrow screens, where there is no room beside the cursor.
    confine: true,
    textStyle: { color: t.text, fontSize: 12 },
    ...extra,
  };
}

/**
 * Drops data labels that would collide instead of letting them overlap.
 *
 * Cheaper and more accurate than a width threshold: it reacts to the actual
 * rendered geometry, so the same chart thins its labels progressively as the
 * container narrows. Needs the `LabelLayout` feature, which is registered.
 */
export const HIDE_OVERLAPPING_LABELS = { hideOverlap: true } as const;

/** `bottom` lifts the legend clear of a dataZoom slider when one is present. */
export function baseLegend(show: boolean, bottom = 0): Record<string, unknown> {
  const t = chartTokens();
  return {
    show,
    bottom,
    // `scroll` keeps the legend on one row and pages the overflow. Left to wrap,
    // it grows upward into the plot on narrow viewports — the grid's bottom
    // inset is a fixed reserve and does not shrink to make room — so labels and
    // the axis name end up drawn on top of each other.
    type: 'scroll',
    icon: 'roundRect',
    itemWidth: 10,
    itemHeight: 10,
    pageIconSize: 10,
    pageIconColor: t.textMuted,
    pageIconInactiveColor: t.grid,
    pageTextStyle: { color: t.textMuted, fontSize: 11 },
    textStyle: { color: t.textMuted, fontSize: 12 },
  };
}

interface AxisOptions {
  name?: string;
  formatter?: ValueFormatter;
  log?: boolean;
  /** Drops the zero-baseline requirement so small variations stay readable. */
  scale?: boolean;
  min?: number;
  max?: number;
}

export function valueAxis(opts: AxisOptions = {}): Record<string, unknown> {
  const t = chartTokens();
  return {
    type: opts.log ? 'log' : 'value',
    name: opts.name,
    nameTextStyle: { color: t.textMuted, fontSize: 11 },
    scale: opts.scale ?? false,
    min: opts.min,
    max: opts.max,
    axisLabel: {
      color: t.textMuted,
      fontSize: 11,
      formatter: opts.formatter ? (v: number) => opts.formatter!(v) : undefined,
    },
    axisLine: { show: false },
    axisTick: { show: false },
    splitLine: { lineStyle: { color: t.grid, type: 'solid' } },
  };
}

export function categoryAxis(
  data: readonly (string | number)[],
  opts: { name?: string; boundaryGap?: boolean } = {},
): Record<string, unknown> {
  const t = chartTokens();
  return {
    type: 'category',
    data,
    name: opts.name,
    nameTextStyle: { color: t.textMuted, fontSize: 11 },
    boundaryGap: opts.boundaryGap ?? true,
    axisLabel: { color: t.textMuted, fontSize: 11 },
    axisLine: { lineStyle: { color: t.grid } },
    axisTick: { show: false },
    splitLine: { show: false },
  };
}

/** Builds a `markLine` block from the shared `RefLine` shape. */
export function markLines(lines: readonly RefLine[]): Record<string, unknown> | undefined {
  if (!lines.length) return undefined;
  const t = chartTokens();
  return {
    silent: true,
    symbol: 'none',
    data: lines.map((l) => ({
      [l.axis === 'x' ? 'xAxis' : 'yAxis']: l.value,
      lineStyle: {
        color: l.color ?? t.neutral,
        type: l.dashed === false ? 'solid' : 'dashed',
        width: 1,
      },
      label: {
        show: Boolean(l.label),
        formatter: l.label,
        position: l.axis === 'x' ? 'insideEndTop' : 'insideEndTop',
        color: t.textMuted,
        fontSize: 11,
      },
    })),
  };
}

/** Builds a `markArea` block from the shared `RefBand` shape. */
export function markAreas(bands: readonly RefBand[]): Record<string, unknown> | undefined {
  if (!bands.length) return undefined;
  const t = chartTokens();
  return {
    silent: true,
    itemStyle: { color: t.track, opacity: 0.7 },
    data: bands.map((b) => {
      const key = b.axis === 'y' ? 'yAxis' : 'xAxis';
      return [
        {
          [key]: b.from,
          name: b.label,
          itemStyle: b.color ? { color: b.color, opacity: 0.18 } : undefined,
          label: {
            show: Boolean(b.label),
            position: 'insideTop',
            color: t.textMuted,
            fontSize: 11,
          },
        },
        { [key]: b.to },
      ];
    }),
  };
}

/** Builds a `markPoint` block from the shared `RefPoint` shape. */
export function markPoints(
  points: readonly RefPoint[],
  formatter?: ValueFormatter,
): Record<string, unknown> | undefined {
  if (!points.length) return undefined;
  const t = chartTokens();
  return {
    symbol: 'circle',
    symbolSize: 8,
    data: points.map((p) => ({
      coord: [p.x, p.y],
      itemStyle: { color: p.color ?? t.text },
      label: {
        show: true,
        position: 'top',
        distance: 8,
        color: t.text,
        fontSize: 11,
        formatter: p.label ?? (formatter ? formatter(p.y) : String(p.y)),
      },
    })),
  };
}

/**
 * Line dash patterns, so multi-series charts stay distinguishable without
 * relying on colour — required by doc 23 and by the cross-cutting a11y rule.
 */
export const DASH_PATTERNS = ['solid', 'dashed', 'dotted', [8, 4, 2, 4], [2, 3], [12, 4]] as const;

export function dashFor(index: number): unknown {
  return DASH_PATTERNS[index % DASH_PATTERNS.length];
}

/** Diagonal hatch, marking "not available" as distinct from a zero value. */
export function hatchFill(color: string): Record<string, unknown> {
  return {
    color: 'transparent',
    borderColor: color,
    borderWidth: 1,
    decal: {
      color,
      dashArrayX: [1, 0],
      dashArrayY: [2, 5],
      symbolSize: 1,
      rotation: Math.PI / 4,
    },
  };
}
