import {
  ChangeDetectionStrategy,
  Component,
  ElementRef,
  computed,
  inject,
  signal,
  viewChildren,
} from '@angular/core';
import { ActivatedRoute, Router } from '@angular/router';
import { toSignal } from '@angular/core/rxjs-interop';

import { ErrorState } from '../../../shared/error-state/error-state';
import { InfoCard } from '../../../shared/info-card/info-card';
import { PageContextBar } from '../../../shared/page-context-bar/page-context-bar';
import { StatusBadge, type StatusTone } from '../../../shared/status-badge/status-badge';
import {
  LOOKBACK_LABEL,
  MACRO_TABS,
  type LookbackWindow,
  type MacroTab,
  type RegimeModelId,
} from '../../../models/macro-regime.model';
import { MacroRegimeService } from '../../../services/macro-regime.service';
import { ButtonDirective } from '../../../shared/ui/button/button.directive';
import { SelectDirective } from '../../../shared/ui/select/select.directive';
import { CorrelationsByRegime } from './correlations-by-regime/correlations-by-regime';
import { HandoffPanel } from './handoff-panel/handoff-panel';
import { PredictiveSignals } from './predictive-signals/predictive-signals';
import { RegimeFilterNowcast } from './regime-filter-nowcast/regime-filter-nowcast';
import { RegimeProbabilities } from './regime-probabilities/regime-probabilities';
import { StressPanel } from './stress-panel/stress-panel';
import { ViewBridge } from './view-bridge/view-bridge';

const LOOKBACKS: readonly LookbackWindow[] = ['1Y', '3Y', '5Y', 'full'];

/** Tone per driver state — always paired with the state's name, never alone. */
const DRIVER_TONE: Record<string, StatusTone> = {
  Crash: 'alert',
  'Slow Growth': 'warn',
  Bull: 'ok',
  Recovery: 'active',
  Bear: 'alert',
  Recession: 'alert',
  Expansion: 'ok',
};

/**
 * `docs/12 Macro & Regimes Agent.md` — the agent that decides what regime the
 * market is in, and what follows from that.
 *
 * The chain the page makes visible runs one way: the filter estimates a regime,
 * the regime implies views on returns and covariances, and those views — with
 * the stress scenarios and the surviving signals — are the payload written to
 * the shared state. The allocation, risk and execution agents read that state;
 * none of them is ever called from here.
 *
 * The page renders no `<h1>` — the shell renders it from the route.
 */
@Component({
  selector: 'app-macro-agent',
  imports: [
    CorrelationsByRegime,
    ErrorState,
    HandoffPanel,
    InfoCard,
    PageContextBar,
    PredictiveSignals,
    RegimeFilterNowcast,
    RegimeProbabilities,
    StatusBadge,
    StressPanel,
    ViewBridge,
    ButtonDirective,
    SelectDirective,
  ],
  templateUrl: './macro-agent.html',
  styleUrl: './macro-agent.css',
  host: { class: 'flex flex-col gap-6' },
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class MacroAgent {
  private readonly service = inject(MacroRegimeService);
  private readonly router = inject(Router);
  private readonly route = inject(ActivatedRoute);

  protected readonly tabs = MACRO_TABS;
  protected readonly lookbacks = LOOKBACKS;
  protected readonly lookbackLabel = LOOKBACK_LABEL;
  protected readonly models = this.service.models;

  protected readonly estimate = this.service.estimate;
  protected readonly model = this.service.model;
  protected readonly lookback = this.service.lookback;
  protected readonly recomputing = this.service.recomputing;
  protected readonly errorMessage = this.service.errorMessage;
  protected readonly staleSignals = this.service.staleSignals;
  protected readonly hasChangesToPublish = this.service.hasChangesToPublish;

  private readonly tabButtons = viewChildren<ElementRef<HTMLButtonElement>>('tabButton');

  /** The active tab lives in the URL, so a section can be linked to directly. */
  private readonly queryParams = toSignal(this.route.queryParamMap, { initialValue: null });

  protected readonly activeTab = computed<MacroTab>(() => {
    const requested = this.queryParams()?.get('tab');
    return MACRO_TABS.some((t) => t.id === requested) ? (requested as MacroTab) : 'overview';
  });

  protected readonly activeTabTitle = computed(
    () => MACRO_TABS.find((t) => t.id === this.activeTab())?.title ?? 'Overview',
  );

  /**
   * A lookback change needs a fresh run, because it changes the sample the
   * recursive filter is estimated over. A model change does not — the filtered
   * probabilities for each model are already there to read.
   */
  protected readonly lookbackDirty = signal(false);

  protected readonly driverTone = computed<StatusTone>(
    () => DRIVER_TONE[this.estimate().driver] ?? 'neutral',
  );

  protected readonly runnerUps = computed(() =>
    [...this.estimate().states]
      .sort((a, b) => b.probability - a.probability)
      .slice(1)
      .map((s) => `${s.name} ${s.probability}%`)
      .join(' · '),
  );

  // --- tabs -----------------------------------------------------------------

  protected selectTab(tab: MacroTab): Promise<boolean> {
    return this.router.navigate([], {
      relativeTo: this.route,
      queryParams: { tab },
      queryParamsHandling: 'merge',
      replaceUrl: true,
    });
  }

  /**
   * Arrow keys move between tabs, Home and End jump to the ends, and only the
   * active tab is in the tab order — the roving pattern a tablist expects.
   */
  protected onTabKeydown(event: KeyboardEvent, index: number): void {
    const count = this.tabs.length;
    let next: number | null = null;

    if (event.key === 'ArrowRight') next = (index + 1) % count;
    else if (event.key === 'ArrowLeft') next = (index - 1 + count) % count;
    else if (event.key === 'Home') next = 0;
    else if (event.key === 'End') next = count - 1;

    if (next === null) return;
    event.preventDefault();
    const target = next;
    // Focus after the navigation settles, not before: the route change is
    // async, and focusing first leaves the tablist with focus on the body —
    // a keyboard user would lose their place on every arrow press.
    void this.selectTab(this.tabs[target].id).then(() => {
      this.tabButtons()[target]?.nativeElement.focus();
    });
  }

  // --- controls -------------------------------------------------------------

  protected onModel(event: Event): void {
    // Reads the already-filtered probabilities for that model; no run needed.
    this.model.set((event.target as HTMLSelectElement).value as RegimeModelId);
  }

  protected onLookback(event: Event): void {
    this.lookback.set((event.target as HTMLSelectElement).value as LookbackWindow);
    this.lookbackDirty.set(true);
  }

  protected async recompute(): Promise<void> {
    await this.service.recompute();
    if (!this.errorMessage()) this.lookbackDirty.set(false);
  }

  protected async retry(): Promise<void> {
    this.service.clearError();
    await this.recompute();
  }
}
