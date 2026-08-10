import {
  ChangeDetectionStrategy,
  Component,
  ElementRef,
  computed,
  inject,
  signal,
} from '@angular/core';

import {
  EMPTY_MESSAGE,
  STALE_READINGS_NOTE,
  type DrawdownMeasureId,
  type LogEntry,
} from '../../../models/risk-monitoring.model';
import { RiskMonitoringService } from '../../../services/risk-monitoring.service';
import { ActionButtonRow } from '../../../shared/action-button-row/action-button-row';
import { CrossPageLink } from '../../../shared/cross-page-link/cross-page-link';
import { EmptyState } from '../../../shared/empty-state/empty-state';
import { ErrorState } from '../../../shared/error-state/error-state';
import { SkeletonBlock } from '../../../shared/skeleton-block/skeleton-block';
import { AlertLog } from './alert-log/alert-log';
import { CdarCurve } from './cdar-curve/cdar-curve';
import { drawdownValue, signedDrawdown } from './monitoring-format';
import { MonitoringToolbar } from './monitoring-toolbar/monitoring-toolbar';
import { RiskReadings } from './risk-readings/risk-readings';
import { ThresholdTable } from './threshold-table/threshold-table';
import { UnderwaterChart, type UnderwaterHighlight } from './underwater-chart/underwater-chart';
import { VarCvarTrend } from './var-cvar-trend/var-cvar-trend';

/** Which figure a selection points at. Only two of the three take marks. */
type MarkedChart = 'underwater' | 'cdar';

/** What the reader last asked to see marked, and where the request came from. */
type Selection =
  | { readonly kind: 'measure'; readonly measure: DrawdownMeasureId }
  | { readonly kind: 'alert'; readonly entry: LogEntry };

const CHART_ANCHOR: Record<MarkedChart, string> = {
  underwater: 'rm-underwater',
  cdar: 'rm-cdar-curve',
};

const CHART_NAME: Record<MarkedChart, string> = {
  underwater: 'underwater / drawdown chart',
  cdar: 'CDaR curve',
};

/** Placeholder heights, matched to the regions they stand in for. */
const SKELETON_CHARTS = [0, 1, 2];

/**
 * `docs/18 Risk Monitoring.md` — the fund's post-investment risk dashboard.
 *
 * The page reads; it never chooses. Every figure on it is taken on the weights
 * the fund actually holds, not on an optimum, and the only controls are the
 * ones that say which reading of those weights is being shown.
 *
 * It is built around the two complementary views the doc insists on keeping
 * apart: the instantaneous one, on the marginal distribution of losses (VaR and
 * CVaR, in that order, always), and the trajectory one, on the equity curve
 * (drawdown, its maximum, its average and the CDaR family that interpolates the
 * last two). The threshold table is where those meet the operational limits,
 * and it is the only place a badge is shown — decided from the utilisation
 * printed beside it, never set by hand.
 *
 * Three cross-region behaviours live here rather than in a region, because each
 * of them starts in one region and lands in another:
 *
 * - a threshold row marks the part of the chart its measure comes from;
 * - a log entry marks the observation it was raised on;
 * - the α slider moves the CDaR readout, the marker and the CDaR row together,
 *   and nothing else on the page — it is a level, not a calculation.
 *
 * The shell renders the `<h1>`, so the page's own outline starts at `<h2>`.
 */
@Component({
  selector: 'app-risk-monitoring',
  imports: [
    ActionButtonRow,
    AlertLog,
    CdarCurve,
    CrossPageLink,
    EmptyState,
    ErrorState,
    MonitoringToolbar,
    RiskReadings,
    SkeletonBlock,
    ThresholdTable,
    UnderwaterChart,
    VarCvarTrend,
  ],
  templateUrl: './risk-monitoring.html',
  styleUrl: './risk-monitoring.css',
  host: { class: 'flex flex-col gap-6' },
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class RiskMonitoring {
  private readonly service = inject(RiskMonitoringService);
  private readonly host = inject(ElementRef<HTMLElement>);

  protected readonly emptyMessage = EMPTY_MESSAGE;
  protected readonly staleNote = STALE_READINGS_NOTE;
  protected readonly relatedPages = this.service.relatedPages;
  protected readonly skeletonCharts = SKELETON_CHARTS;

  protected readonly state = this.service.state;
  protected readonly stale = this.service.stale;
  protected readonly errorMessage = this.service.errorMessage;
  protected readonly errorDetail = this.service.errorDetail;

  private readonly selection = signal<Selection | null>(null);

  /** The threshold row to mark as current, when a measure is what was picked. */
  protected readonly selectedMeasure = computed<DrawdownMeasureId | null>(() => {
    const selection = this.selection();
    return selection?.kind === 'measure' ? selection.measure : null;
  });

  protected readonly selectedAlert = computed<LogEntry | null>(() => {
    const selection = this.selection();
    return selection?.kind === 'alert' ? selection.entry : null;
  });

  /**
   * The mark on the underwater chart.
   *
   * MaxDD is one episode and gets the observation it happened on. AvDD is the
   * time average of the whole path: there is no single observation that *is*
   * the average, so it is marked as a level and said in words instead of being
   * pinned to a date that would be a fabrication.
   */
  protected readonly underwaterHighlight = computed<UnderwaterHighlight | null>(() => {
    const selection = this.selection();
    if (selection === null) return null;

    const summary = this.service.drawdownSummary();
    const units = this.service.drawdownUnits();

    if (selection.kind === 'measure') {
      if (selection.measure === 'maxdd') {
        const value = signedDrawdown(summary.maxDrawdown, summary.maxDrawdownAbs, units);
        return { date: summary.maxDrawdownAt, label: `MaxDD ${value} on ${summary.maxDrawdownAt}` };
      }
      if (selection.measure === 'avdd') {
        const value = signedDrawdown(summary.averageDrawdown, summary.averageDrawdownAbs, units);
        return {
          date: null,
          label: `AvDD ${value} — the time average over all ${summary.observations} observations`,
        };
      }
      return null;
    }

    if (this.chartFor(selection.entry) !== 'underwater') return null;
    return {
      date: this.observationOf(selection.entry),
      label: `${selection.entry.at} · ${selection.entry.text}`,
    };
  });

  protected readonly cdarHighlight = computed<string | null>(() => {
    const selection = this.selection();
    if (selection === null) return null;

    if (selection.kind === 'measure') {
      if (selection.measure !== 'cdar') return null;
      const row = this.service.thresholds().find((entry) => entry.measure === 'cdar');
      if (!row) return null;
      const units = this.service.drawdownUnits();
      return (
        `${row.symbol} = ${drawdownValue(row.current, row.currentAbs, units)} against a ` +
        `${drawdownValue(row.limit, row.limitAbs, units)} limit`
      );
    }

    if (this.chartFor(selection.entry) !== 'cdar') return null;
    return `${selection.entry.at} · ${selection.entry.text}`;
  });

  /**
   * Where the activated log entry was marked, for the panel's detail line.
   *
   * Only the underwater chart is drawn against dates, so only it can be told
   * *where* the mark landed. The CDaR curve's axis is α: naming an observation
   * on it would send the reader looking for a date that figure does not plot.
   */
  protected readonly alertAnchorNote = computed(() => {
    const entry = this.selectedAlert();
    if (entry === null) return '';
    const chart = this.chartFor(entry);
    const observation = chart === 'underwater' ? this.observationOf(entry) : null;
    const where = observation
      ? `at ${observation} on the ${CHART_NAME[chart]} above`
      : `on the ${CHART_NAME[chart]} above`;
    return `Marked ${where}.`;
  });

  protected onMeasureSelected(measure: DrawdownMeasureId): void {
    this.selection.set({ kind: 'measure', measure });
    this.reveal(measure === 'cdar' ? 'cdar' : 'underwater');
  }

  protected onAlertSelected(entry: LogEntry): void {
    this.selection.set({ kind: 'alert', entry });
    this.reveal(this.chartFor(entry));
  }

  protected async retry(): Promise<void> {
    this.service.clearError();
    await this.service.refresh();
  }

  /**
   * Which figure an alert belongs to.
   *
   * The CDaR entries name a level of the family, which is a reading of the
   * curve rather than of a moment on the path; everything else is a fall, a
   * duration or a return to a high, and those are events on the drawdown path.
   */
  private chartFor(entry: LogEntry): MarkedChart {
    return entry.text.includes('CDaR') ? 'cdar' : 'underwater';
  }

  /**
   * The observation an entry was raised on, when the path contains it.
   *
   * Null rather than the nearest date: marking a point the series does not have
   * would put a dot on the chart that stands for nothing.
   */
  private observationOf(entry: LogEntry): string | null {
    const date = entry.at.slice(0, 10);
    return this.service.underwaterSeries().some((point) => point.date === date) ? date : null;
  }

  /**
   * Brings the marked figure into view, and takes the focus with it.
   *
   * Scrolling alone would leave a keyboard user's focus in the region they just
   * left — off-screen, several screens away from what they asked to see, with
   * the next Tab landing somewhere they cannot see either. The anchor takes a
   * programmatic `tabindex` so it can receive focus without joining the tab
   * order; `styles.css` suppresses the ring on those, so nothing is painted.
   * Same move as `backtest-validation`'s in-page navigation.
   *
   * Guarded on the methods existing so a non-browser environment is not asked
   * to scroll, and it honours `prefers-reduced-motion` — an unexpected smooth
   * scroll of a long page is exactly the motion that setting is for.
   */
  private reveal(chart: MarkedChart): void {
    const target = this.host.nativeElement.querySelector(`#${CHART_ANCHOR[chart]}`);
    if (!(target instanceof HTMLElement) || typeof target.scrollIntoView !== 'function') return;
    const reduced = globalThis.matchMedia?.('(prefers-reduced-motion: reduce)').matches ?? false;
    target.scrollIntoView({ behavior: reduced ? 'auto' : 'smooth', block: 'start' });
    target.setAttribute('tabindex', '-1');
    target.focus({ preventScroll: true });
  }
}
