import { ChangeDetectionStrategy, Component, computed, inject } from '@angular/core';

import {
  ATTRIBUTION_METHOD_LABEL,
  ATTRIBUTION_METHOD_NOTE,
  HEDGE_ICON,
  HEDGE_LABEL,
  HEDGE_NOTE,
  MARGINAL_DI_UNDEFINED_NOTE,
  RORAC_UNDEFINED_NOTE,
} from '../../../../models/risk-attribution.model';
import { RiskAttributionService } from '../../../../services/risk-attribution.service';
import { CrossPageLink } from '../../../../shared/cross-page-link/cross-page-link';
import { SlideOverComponent } from '../../../../shared/ui/slide-over/slide-over';
import { NOT_APPLICABLE, optionalShare, ratio, riskAmount, share } from '../attribution-format';

/** How the component's RORAC sits against the book's, in words. */
const RORAC_VERDICT: Record<'above' | 'below' | 'level', string> = {
  above: 'above — adding to it marginally improves the book’s RORAC',
  below: 'below — adding to it marginally worsens the book’s RORAC',
  level: 'level with the portfolio',
};

/**
 * Region 6 — one component, compared against itself and against the book.
 *
 * Every figure is the row's own: the panel computes nothing, so it cannot
 * disagree with the line the reader clicked. What it adds is the comparison the
 * table has no room for — the stand-alone risk, the with-without contribution
 * and the Euler contribution side by side, which is the whole argument for
 * using the third of them — and the note that turns a risk contribution into an
 * expected contribution to a large loss.
 *
 * Focus is where this panel parts company with doc 15's, and deliberately.
 * `app-slide-over` traps focus and hands it back to whatever was focused when
 * it opened — the table row or the chart bar — and it moves focus to the first
 * focusable child on open. Doc 15 overrode that to land on the heading; doc
 * 19's `### Accessibilità` names the target explicitly ("l'apertura sposta il
 * focus su ClosePanelButton"), so the close button is the panel's first
 * focusable child and nothing overrides the trap. The heading keeps its
 * `tabindex="-1"` so it is still a programmatic target, and the dialog's
 * accessible name already carries the component, so nothing is lost by not
 * parking on it.
 */
@Component({
  selector: 'app-component-detail-panel',
  imports: [CrossPageLink, SlideOverComponent],
  templateUrl: './component-detail-panel.html',
  host: { class: 'block' },
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class ComponentDetailPanel {
  private readonly service = inject(RiskAttributionService);

  protected readonly hedgeIcon = HEDGE_ICON;
  protected readonly hedgeLabel = HEDGE_LABEL;
  protected readonly hedgeNote = HEDGE_NOTE;
  protected readonly roracUndefinedNote = RORAC_UNDEFINED_NOTE;
  protected readonly marginalDiUndefinedNote = MARGINAL_DI_UNDEFINED_NOTE;
  protected readonly notApplicable = NOT_APPLICABLE;

  protected readonly detail = this.service.selectedDetail;
  protected readonly open = computed(() => this.detail() !== null);

  /** Names the component, not just the region — four rows open the same dialog. */
  protected readonly dialogLabel = computed(() => {
    const detail = this.detail();
    return detail ? `Risk contribution detail — ${detail.title}` : 'Risk contribution detail';
  });

  /** The message the spec makes the method control own. */
  protected readonly methodNote = computed(() => ATTRIBUTION_METHOD_NOTE[this.service.method()]);

  protected readonly methodLabel = computed(
    () => ATTRIBUTION_METHOD_LABEL[this.service.method()],
  );

  protected readonly portfolioRorac = computed(() => optionalShare(this.service.portfolioRorac()));

  protected readonly roracVerdict = computed(() => {
    const detail = this.detail();
    if (!detail || detail.roracVsPortfolio === null) return null;
    return RORAC_VERDICT[detail.roracVsPortfolio];
  });

  protected amount(value: number): string {
    return riskAmount(value, this.service.displayUnit(), this.service.netAssetValue());
  }

  protected shareOf(value: number): string {
    return share(value);
  }

  protected rorac(value: number | null): string {
    return optionalShare(value);
  }

  protected index(value: number | null): string {
    return ratio(value);
  }

  /** `0.101` — the beta is the Euler share, printed at the precision it earns. */
  protected beta(value: number): string {
    return value.toFixed(3);
  }

  /**
   * Clearing the selection closes the panel, which destroys the focus trap and
   * hands focus back to the row or bar that opened it.
   */
  protected close(): void {
    this.service.selectComponent(null);
  }
}
