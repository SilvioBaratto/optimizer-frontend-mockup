import {
  ChangeDetectionStrategy,
  Component,
  ElementRef,
  computed,
  inject,
  viewChild,
} from '@angular/core';

import {
  ATTRIBUTION_EMPTY_DETAIL,
  ATTRIBUTION_EMPTY_TITLE,
} from '../../../models/risk-attribution.model';
import { RiskAttributionService } from '../../../services/risk-attribution.service';
import { ActionButtonRow } from '../../../shared/action-button-row/action-button-row';
import { CrossPageLink } from '../../../shared/cross-page-link/cross-page-link';
import { EmptyState } from '../../../shared/empty-state/empty-state';
import { ErrorState } from '../../../shared/error-state/error-state';
import { PageContextBar } from '../../../shared/page-context-bar/page-context-bar';
import { SelectDirective } from '../../../shared/ui/select/select.directive';
import { AttributionSummary } from './attribution-summary/attribution-summary';
import { AttributionToolbar } from './attribution-toolbar/attribution-toolbar';
import { ComponentDetailPanel } from './component-detail-panel/component-detail-panel';
import { ContributionChart } from './contribution-chart/contribution-chart';
import { ContributionTable } from './contribution-table/contribution-table';
import { FactorRiskImpact } from './factor-risk-impact/factor-risk-impact';

/**
 * `docs/19 Risk Attribution.md` — the economic capital of an allocated book,
 * split into contributions that actually add up.
 *
 * The page's one claim is that there is a single correct way to do that split
 * and it is not obvious. `ρ` is homogeneous of degree one, so Euler's theorem
 * makes the gradient contributions sum to `ρ(X)` exactly *and* makes them RORAC
 * compatible — the two properties hold together or not at all, and the
 * Aumann-Shapley value is the only coherent linear principle that delivers
 * them. The with-without difference is the intuitive alternative and it is
 * available in the toolbar, precisely so the page can show what is wrong with
 * it: its contributions sum to strictly less than EC, and rescaling them to
 * close that gap destroys the RORAC compatibility that was the reason to
 * attribute at all. Nothing on this page rescales them.
 *
 * Everything on screen is read-only. There is no destructive action anywhere —
 * the controls choose parameters and the exports copy the current view — so no
 * confirmation dialog appears, which the spec calls out explicitly.
 *
 * Regions follow the spec in order: Toolbar → KeyMetricsRow → DataTable →
 * ChartPanel → FactorRiskImpactPanel → DetailPanel. The shell renders the
 * `<h1>` and the breadcrumb from the route, so headings here start at `<h2>`.
 */
@Component({
  selector: 'app-risk-attribution',
  imports: [
    ActionButtonRow,
    AttributionSummary,
    AttributionToolbar,
    ComponentDetailPanel,
    ContributionChart,
    ContributionTable,
    CrossPageLink,
    EmptyState,
    ErrorState,
    FactorRiskImpact,
    PageContextBar,
    SelectDirective,
  ],
  templateUrl: './risk-attribution.html',
  styleUrl: './risk-attribution.css',
  host: { class: 'flex flex-col gap-6' },
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class RiskAttribution {
  private readonly service = inject(RiskAttributionService);

  private readonly content = viewChild<ElementRef<HTMLElement>>('content');

  protected readonly state = this.service.state;
  protected readonly error = this.service.error;
  protected readonly portfolios = this.service.portfolios;
  protected readonly portfolioId = this.service.portfolioId;

  protected readonly emptyTitle = computed(() => {
    const reason = this.service.emptyReason();
    return reason === null ? '' : ATTRIBUTION_EMPTY_TITLE[reason];
  });

  protected readonly emptyDetail = computed(() => {
    const reason = this.service.emptyReason();
    return reason === null ? '' : ATTRIBUTION_EMPTY_DETAIL[reason];
  });

  /**
   * The scope seam.
   *
   * The topbar's ScopeSwitcher writes to `FundService`, not to this service, so
   * the empty state's own picker is what actually re-points the page — and it
   * is the "open the scope switcher" action the spec asks the empty state to
   * carry.
   */
  protected onPortfolio(event: Event): void {
    const value = (event.target as HTMLSelectElement).value;
    this.service.selectPortfolio(value === '' ? null : value);
  }

  /**
   * Retrying destroys the alert the button lives in, so focus is moved out of
   * it first — onto the content region the result will appear in. Left alone,
   * focus falls to `<body>` and the next Tab restarts at the top of the page.
   */
  protected async retry(): Promise<void> {
    this.content()?.nativeElement.focus();
    this.service.clearError();
    await this.service.recompute();
  }
}
