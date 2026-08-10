import {
  ChangeDetectionStrategy,
  Component,
  ElementRef,
  computed,
  effect,
  inject,
  signal,
  viewChild,
  viewChildren,
} from '@angular/core';

import { CrossPageLink } from '../../../../shared/cross-page-link/cross-page-link';
import { SlideOverComponent } from '../../../../shared/ui/slide-over/slide-over';
import {
  ORDER_STAGES,
  ORDER_STAGE_DETAIL,
  ORDER_STAGE_ICON,
  ORDER_STAGE_LABEL,
  ORDER_SIDE_LABEL,
  ORDER_STATUS_ICON,
  ORDER_STATUS_LABEL,
  type OrderStage,
  type ProposedOrder,
} from '../../../../models/order.model';
import { ExecutionService, formatWaiting } from '../../../../services/execution.service';
import { formatImpact, formatSignedQuantity, groupDigits } from '../order-format';
import { CostVarianceChart } from './cost-variance-chart';
import { TrajectoryChart } from './trajectory-chart';

export type DetailTab = 'trajectory' | 'frontier' | 'pipeline' | 'impact';

interface TabDefinition {
  readonly id: DetailTab;
  readonly label: string;
}

const TABS: readonly TabDefinition[] = [
  { id: 'trajectory', label: 'Trajectory' },
  { id: 'frontier', label: 'Cost–Variance Frontier' },
  { id: 'pipeline', label: 'Pipeline & Approval' },
  { id: 'impact', label: 'Impact Parameters' },
];

/** What one pipeline step is doing for this particular order. */
interface PipelineStep {
  readonly stage: OrderStage;
  readonly label: string;
  readonly detail: string;
  readonly icon: string;
  readonly state: string;
  readonly note: string | null;
  readonly current: boolean;
}

/**
 * The selected order in four views: how it will be traded, what that costs
 * against what it risks, where it stands in the pipeline, and the impact
 * parameters the schedule was solved against.
 *
 * The panel is deliberately read-only. Every page spec for this agent says the
 * same thing in a different way — the model proposes orders and never executes
 * them — so the only controls that change anything in the world are the two
 * cross-page links at the bottom of the Pipeline tab, which lead to pages that
 * ask for their own confirmation.
 *
 * Focus is the part worth reading twice. `app-slide-over` traps focus and
 * restores it to whatever was focused when it opened, which is the row's expand
 * toggle; on top of that the spec asks for focus to land on the panel's
 * heading rather than its first control, so the heading is focusable and is
 * focused a microtask after the trap has had its turn.
 */
@Component({
  selector: 'app-execution-order-detail',
  imports: [CostVarianceChart, CrossPageLink, SlideOverComponent, TrajectoryChart],
  templateUrl: './order-detail-panel.html',
  host: { class: 'block' },
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class OrderDetailPanel {
  private readonly service = inject(ExecutionService);

  protected readonly tabs = TABS;
  protected readonly sideLabel = ORDER_SIDE_LABEL;
  protected readonly signedQuantity = formatSignedQuantity;
  protected readonly quantity = groupDigits;
  protected readonly impactValue = formatImpact;

  protected readonly order = this.service.selectedOrder;
  protected readonly open = computed(() => this.order() !== null);
  protected readonly brokerConfigured = this.service.brokerConfigured;
  protected readonly broker = this.service.broker;

  protected readonly activeTab = signal<DetailTab>('trajectory');

  private readonly heading = viewChild<ElementRef<HTMLElement>>('panelHeading');
  private readonly tabButtons = viewChildren<ElementRef<HTMLButtonElement>>('tabButton');

  /** Tracks the open→closed edge so focus moves on opening and not on every render. */
  private wasOpen = false;

  constructor() {
    effect(() => {
      if (!this.open()) {
        this.wasOpen = false;
        return;
      }
      if (this.wasOpen) return;
      this.wasOpen = true;
      // Every order opens on the first tab, so the panel never inherits the
      // tab a previous order happened to be left on.
      this.activeTab.set('trajectory');
      // After the render pass, and after the focus trap has focused the first
      // control inside the panel — the spec puts focus on the heading instead,
      // so a screen reader hears what was opened before it hears a control.
      queueMicrotask(() => this.heading()?.nativeElement.focus());
    });
  }

  protected readonly headingText = computed(() => {
    const order = this.order();
    if (!order) return 'Order detail';
    return `${order.symbol} ${ORDER_SIDE_LABEL[order.side]} ${formatSignedQuantity(order.targetQuantityDelta)}`;
  });

  /**
   * The dialog's accessible name.
   *
   * It names the order rather than only the region: a reader who hears
   * "Proposed order detail, dialog" from four different rows has been told
   * nothing about which one opened.
   */
  protected readonly dialogLabel = computed(() => `Proposed order detail — ${this.headingText()}`);

  /**
   * How long the open order has been waiting, formatted.
   *
   * Asked of the service rather than read off the order: the wait is the gap
   * between the order's own stamps and the snapshot behind the page, and only
   * the service holds that snapshot. Reading it through a `computed` is also
   * what makes the line follow a refresh instead of printing the wait as of
   * whenever the panel was opened.
   */
  protected readonly waiting = computed(() => {
    const order = this.order();
    return order === null ? '' : formatWaiting(this.service.waitingSecondsFor(order));
  });

  protected readonly unpriced = computed(() => {
    const order = this.order();
    return (
      order === null || order.estimatedShortfallBps === null || order.estimatedRiskBps === null
    );
  });

  /** The four steps with their state for this order, in pipeline order. */
  protected readonly pipeline = computed<PipelineStep[]>(() => {
    const order = this.order();
    if (!order) return [];

    const reached = ORDER_STAGES.indexOf(order.stage);
    const configured = this.brokerConfigured();

    return ORDER_STAGES.map((stage, index) => {
      const label = ORDER_STAGE_LABEL[stage];
      const detail = ORDER_STAGE_DETAIL[stage];

      if (stage === 'broker-adapter' && !configured) {
        return {
          stage,
          label,
          detail,
          icon: '—',
          state: 'Not configured',
          note: 'No adapter is registered, so the order stops after the human gate and is placed by hand.',
          current: false,
        };
      }

      if (index < reached) {
        return { stage, label, detail, icon: '✓', state: 'Passed', note: null, current: false };
      }

      if (index === reached) {
        // "Pending approval" is only true at the gate. An order still sitting
        // at the deterministic check or in the rules engine is pending on a
        // machine, and labelling that step "Pending approval" would tell the
        // reader a person is being asked for something that nobody has asked
        // for yet — and would contradict the table, which prints the stage.
        const waitingOnAMachine = order.status === 'pending' && stage !== 'human-gate';
        return {
          stage,
          label,
          detail,
          icon: waitingOnAMachine ? ORDER_STAGE_ICON[stage] : ORDER_STATUS_ICON[order.status],
          state: waitingOnAMachine ? 'In progress' : ORDER_STATUS_LABEL[order.status],
          note: order.statusReason,
          current: true,
        };
      }

      return {
        stage,
        label,
        detail,
        icon: ORDER_STAGE_ICON[stage],
        state: 'Not reached',
        note: null,
        current: false,
      };
    });
  });

  // --- tabs -----------------------------------------------------------------

  protected selectTab(tab: DetailTab): void {
    this.activeTab.set(tab);
  }

  /**
   * Roving focus across the tablist: arrows move and activate, Home and End
   * jump to the ends, and only the selected tab is in the page's tab order.
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
    this.selectTab(this.tabs[next].id);
    this.tabButtons()[next]?.nativeElement.focus();
  }

  // --- lifecycle ------------------------------------------------------------

  /**
   * Clearing the selection closes the panel, which destroys the focus trap and
   * hands focus back to the row that opened it.
   */
  protected close(): void {
    this.service.selectedOrderId.set(null);
  }

  protected notionalOf(order: ProposedOrder): string {
    return groupDigits(order.notionalValue);
  }
}
