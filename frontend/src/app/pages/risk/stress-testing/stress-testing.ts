import {
  ChangeDetectionStrategy,
  Component,
  ElementRef,
  computed,
  inject,
  viewChild,
  viewChildren,
} from '@angular/core';

import {
  STRESS_MODES,
  STRESS_MODE_DEFINITION,
  STRESS_MODE_LABEL,
  type StressMode,
} from '../../../models/stress-testing.model';
import { StressTestingService } from '../../../services/stress-testing.service';
import { ActionButtonRow } from '../../../shared/action-button-row/action-button-row';
import { CrossPageLink } from '../../../shared/cross-page-link/cross-page-link';
import { ErrorState } from '../../../shared/error-state/error-state';
import { FactorTable } from './factor-table/factor-table';
import { LossContributions } from './loss-contributions/loss-contributions';
import { ReversePanel } from './reverse-panel/reverse-panel';
import { ScenarioLibrary } from './scenario-library/scenario-library';
import { ScenarioSummary } from './scenario-summary/scenario-summary';
import { SeverityChart } from './severity-chart/severity-chart';
import { StressToolbar } from './stress-toolbar/stress-toolbar';

/**
 * `docs/20 Stress Testing & Scenarios.md` — severe but plausible, searched for
 * rather than guessed at.
 *
 * The page exists because hand-picked scenarios fail in two opposite ways: they
 * miss plausible scenarios that never happened, and they include implausible
 * ones nobody will act on. The remedy is to define a region of plausibility on
 * the distribution of the systematic factors — `Ell_k = { r : Maha(r) ≤ k }`,
 * an ellipsoid whose radius is a number of standard deviations of the
 * *multivariate* move, correlations included — and search it exhaustively for
 * the lowest conditional expected profit. The reverse tab runs the same
 * machinery backwards: fix the outcome, read off the plausibility it costs.
 *
 * Two invariants hold this page together, and both live above the regions:
 *
 * 1. **Nothing recomputes on its own.** The impact measure and `k` are not
 *    settings but the coordinates every figure is stated in, so moving either
 *    marks every result stale — with a text badge, in words — and changes no
 *    number at all. A CEP computed against risk-weighted assets is not a CEP in
 *    per cent of NAV rescaled; the two measures have independent expected
 *    profits and independent loss scales, so relabelling one as the other would
 *    print a figure nobody computed. That was the blocking review finding on
 *    the source wireframe and it is closed structurally: every result carries
 *    its own `k`, `measure` and `unit`, and every region prints the unit it is
 *    handed rather than the one the toolbar currently shows.
 * 2. **The two tabs are two views of one set of parameters.** The toolbar and
 *    the scenario library are outside the tab panel and shared; the factor
 *    table, the summary grid and the two figures are replaced wholesale by the
 *    reverse panel. Nothing about `k` or the measure changes when the tab does.
 *
 * Region order follows the spec: Toolbar → TabBar → DataTable → SectionCardGrid
 * → ChartPanel (severity) → ChartPanel (key risk factors) → ScenarioLibrary,
 * with ReverseStressPanel standing in for the middle four in the reverse mode.
 * The shell renders the `<h1>` and the breadcrumb from the route, so headings
 * here start at `<h2>`.
 */
@Component({
  selector: 'app-stress-testing',
  imports: [
    ActionButtonRow,
    CrossPageLink,
    ErrorState,
    FactorTable,
    LossContributions,
    ReversePanel,
    ScenarioLibrary,
    ScenarioSummary,
    SeverityChart,
    StressToolbar,
  ],
  templateUrl: './stress-testing.html',
  styleUrl: './stress-testing.css',
  host: { class: 'flex flex-col gap-6' },
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class StressTesting {
  private readonly service = inject(StressTestingService);

  private readonly tabButtons = viewChildren<ElementRef<HTMLButtonElement>>('tabButton');
  private readonly panel = viewChild<ElementRef<HTMLElement>>('panel');

  protected readonly modes = STRESS_MODES;
  protected readonly modeLabel = STRESS_MODE_LABEL;
  protected readonly modeDefinition = STRESS_MODE_DEFINITION;

  protected readonly mode = this.service.mode;

  /**
   * The failures this page shows above the summary grid.
   *
   * A reverse failure belongs above the reverse panel's own Result and is
   * rendered there; showing it here as well would put the same alert on screen
   * twice.
   */
  protected readonly forwardError = computed(() => {
    const error = this.service.error();
    return error !== null && error.section !== 'reverse' ? error : null;
  });

  protected selectMode(mode: StressMode): void {
    this.service.setMode(mode);
  }

  /**
   * Arrow keys move between tabs, Home and End jump to the ends, and only the
   * active tab is in the tab order — the roving pattern a tablist expects.
   *
   * Activation follows focus, which is the right choice here: switching costs
   * nothing, recomputes nothing and discards nothing, because both panels read
   * the same parameters and the results of both survive the switch.
   */
  protected onTabKeydown(event: KeyboardEvent, index: number): void {
    const count = this.modes.length;
    let next: number | null = null;

    if (event.key === 'ArrowRight') next = (index + 1) % count;
    else if (event.key === 'ArrowLeft') next = (index - 1 + count) % count;
    else if (event.key === 'Home') next = 0;
    else if (event.key === 'End') next = count - 1;

    if (next === null) return;
    event.preventDefault();
    this.selectMode(this.modes[next]);
    this.tabButtons()[next]?.nativeElement.focus();
  }

  /**
   * Retrying destroys the alert the button lives in, so focus is moved out of
   * it first — onto the panel the result will appear in. Left alone, focus
   * falls to `<body>` and the next Tab restarts at the top of the page.
   */
  protected async retry(): Promise<void> {
    const failed = this.forwardError();
    if (failed === null) return;
    this.panel()?.nativeElement.focus();
    this.service.clearError();
    if (failed.section === 'manual') {
      await this.service.evaluateManual();
      return;
    }
    await this.service.runWorstCase();
  }
}
