import { ChangeDetectionStrategy, Component, computed, inject } from '@angular/core';

import {
  BarChartComponent,
  FrontierChartComponent,
  percent,
  type CategorySeries,
  type FrontierMarker,
  type Point,
} from '../../../shared/charts';
import { ErrorState } from '../../../shared/error-state/error-state';
import { CardTitle, InfoCard } from '../../../shared/info-card/info-card';
import { MathVar } from '../../../shared/math/math-var';
import { PageContextBar } from '../../../shared/page-context-bar/page-context-bar';
import { SkeletonBlock } from '../../../shared/skeleton-block/skeleton-block';
import { StatusBadge, type StatusTone } from '../../../shared/status-badge/status-badge';
import { AGENT_STATUS_LABEL, type AgentStatus } from '../../../models/allocation-agent.model';
import { AllocationAgentService } from '../../../services/allocation-agent.service';
import { ButtonDirective } from '../../../shared/ui/button/button.directive';
import { AllocationParameters } from './allocation-parameters/allocation-parameters';
import { EstimationDiagnostics } from './estimation-diagnostics/estimation-diagnostics';
import { MacroInput } from './macro-input/macro-input';
import { ProposedAllocation } from './proposed-allocation/proposed-allocation';
import { PublicationBanner } from './publication-banner/publication-banner';
import { RunLog } from './run-log/run-log';

const STATUS_TONE: Record<AgentStatus, StatusTone> = {
  idle: 'neutral',
  running: 'active',
  done: 'ok',
  error: 'alert',
};

/**
 * `docs/13 Allocation Agent.md` — the node that turns a macro state into
 * portfolio weights.
 *
 * Two commitments shape the whole page. The first is the graph: the agent reads
 * z_t from the shared fund state and writes a proposed allocation back to it,
 * and it never calls another agent — so the input card is read-only and the
 * publication banner is the only outward channel (ARCHITECTURE §7.3).
 *
 * The second is that nothing on the page recomputes itself. Editing a parameter
 * marks the configuration modified; the weights, the charts and the diagnostics
 * all stay the ones the last run actually solved. Anything else would let a
 * reader publish an allocation that no solver ever produced.
 *
 * The page renders no `<h1>` — the shell renders it from the route.
 */
@Component({
  selector: 'app-allocation-agent',
  imports: [
    AllocationParameters,
    BarChartComponent,
    ErrorState,
    EstimationDiagnostics,
    FrontierChartComponent,
    InfoCard,
    MacroInput,
    MathVar,
    PageContextBar,
    ProposedAllocation,
    PublicationBanner,
    RunLog,
    SkeletonBlock,
    StatusBadge,
    ButtonDirective,
    CardTitle,
  ],
  templateUrl: './allocation-agent.html',
  styleUrl: './allocation-agent.css',
  host: { class: 'flex flex-col gap-6' },
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class AllocationAgent {
  private readonly service = inject(AllocationAgentService);

  protected readonly percent = percent;
  protected readonly statusLabel = AGENT_STATUS_LABEL;

  protected readonly status = this.service.status;
  protected readonly lastRun = this.service.lastRun;
  protected readonly computeError = this.service.computeError;
  protected readonly hasMacroInput = this.service.hasMacroInput;
  protected readonly canRun = this.service.canRun;
  protected readonly targetReturnInvalid = this.service.targetReturnInvalid;
  protected readonly summary = this.service.summary;
  protected readonly atLimitCount = this.service.atLimitCount;

  protected readonly statusTone = computed<StatusTone>(() => STATUS_TONE[this.status()]);
  protected readonly running = computed(() => this.status() === 'running');

  /** A failed run leaves the previous result on screen, marked for what it is. */
  protected readonly superseded = computed(() => this.computeError() !== null);

  // --- frontier -------------------------------------------------------------

  protected readonly curve = computed<readonly Point[]>(() =>
    this.service.frontierCurve().map((p) => [p[0], p[1]] as Point),
  );

  protected readonly inefficientBranch = computed<readonly Point[]>(() =>
    this.service.inefficientBranch().map((p) => [p[0], p[1]] as Point),
  );

  /**
   * No marker carries `emphasis`: the chart derives the capital allocation line
   * through whichever marker is emphasised, and emphasising the proposal would
   * draw a line that is not tangent to anything.
   */
  protected readonly markers = computed<readonly FrontierMarker[]>(() =>
    this.service.frontierPoints().map((p) => ({
      name: p.label,
      x: p.volatility,
      y: p.expectedReturn,
    })),
  );

  protected readonly frontierCaption = computed(() => {
    const points = this.service.frontierPoints();
    return points.map((p) => `${p.label} — ${p.description}`).join(' · ');
  });

  // --- weight vs risk contribution ------------------------------------------

  private readonly included = computed(() => this.service.includedRows());

  protected readonly contributionCategories = computed(() =>
    this.included().map((r) => r.ticker),
  );

  protected readonly contributionSeries = computed<readonly CategorySeries[]>(() => [
    { name: 'Weight', data: this.included().map((r) => r.weight ?? 0) },
    {
      name: 'Total risk contribution',
      data: this.included().map((r) => r.riskContribution ?? 0),
    },
  ]);

  /** 24px a row keeps two bars per asset legible rather than hairline-thin. */
  protected readonly contributionHeight = computed(() =>
    Math.max(320, 60 + this.included().length * 30),
  );

  // --- actions --------------------------------------------------------------

  protected run(): void {
    void this.service.run();
  }
}
