/**
 * Tree-shaken ECharts build.
 *
 * This module is only ever reached through the dynamic `import()` in
 * `ChartPanelComponent`'s `provideEchartsCore` call, which keeps ECharts
 * (~1.1MB minified when imported whole) out of the initial bundle — the
 * production budget errors at 1MB.
 *
 * Register a chart/component here before using it in an option object;
 * anything not listed is dropped at build time and fails at runtime with
 * "Series bar is used but not imported".
 *
 * `CanvasRenderer`, not `SVGRenderer`: docs 08 and 19 specify an "Export chart
 * (PNG)" action, and under SVG `getDataURL()` returns an SVG data URI rather
 * than a raster. One renderer for all charts also keeps text metrics and
 * antialiasing identical across pages.
 *
 * Deliberately absent: `HeatmapChart` and `PieChart` (no page in the specs
 * uses either), `GaugeChart` (ECharts gauges are radial; the specs draw linear
 * bands, which `BulletChartComponent` builds from a bar track instead), and
 * `ToolboxComponent` (PNG export goes through `getDataURL()` from the page's
 * own button, not the floating toolbox icon).
 */
import * as echarts from 'echarts/core';
import { BarChart, LineChart, ScatterChart } from 'echarts/charts';
import {
  DataZoomComponent,
  GridComponent,
  LegendComponent,
  MarkAreaComponent,
  MarkLineComponent,
  MarkPointComponent,
  TooltipComponent,
  VisualMapComponent,
} from 'echarts/components';
import { LabelLayout } from 'echarts/features';
import { CanvasRenderer } from 'echarts/renderers';

echarts.use([
  BarChart,
  LineChart,
  ScatterChart,
  GridComponent,
  TooltipComponent,
  LegendComponent,
  DataZoomComponent,
  MarkLineComponent,
  MarkAreaComponent,
  MarkPointComponent,
  VisualMapComponent,
  LabelLayout,
  CanvasRenderer,
]);

export default echarts;
