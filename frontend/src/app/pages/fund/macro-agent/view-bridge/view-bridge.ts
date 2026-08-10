import { ChangeDetectionStrategy, Component, inject } from '@angular/core';

import { CrossPageLink } from '../../../../shared/cross-page-link/cross-page-link';
import {
  ASSET_CLASS_FILTER_LABEL,
  type AssetClassFilter,
} from '../../../../models/macro-regime.model';
import { MacroRegimeService } from '../../../../services/macro-regime.service';
import { SelectDirective } from '../../../../shared/ui/select/select.directive';

const FILTERS: readonly AssetClassFilter[] = [
  'all',
  'equities',
  'bonds',
  'credit',
  'commodities',
  'currencies',
];

/**
 * The bridge from the estimated regime to the views Black-Litterman ingests.
 *
 * Nothing is computed here — the departures arrive with the estimate. What the
 * panel makes visible is that they have a direction, and that the direction is
 * the regime's: in a risk-on state the growth-sensitive classes get a higher
 * expected return and slacker correlations, and government bonds get the
 * opposite. Switch the driver to Crash and every sign flips.
 */
@Component({
  selector: 'app-view-bridge',
  imports: [CrossPageLink,
    SelectDirective,
  ],
  templateUrl: './view-bridge.html',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class ViewBridge {
  private readonly service = inject(MacroRegimeService);

  protected readonly filters = FILTERS;
  protected readonly filterLabel = ASSET_CLASS_FILTER_LABEL;
  protected readonly assetClassFilter = this.service.assetClassFilter;
  protected readonly views = this.service.views;
  protected readonly estimate = this.service.estimate;
  protected readonly confidence = this.service.viewConfidence;
  protected readonly riskOn = this.service.riskOn;

  protected onFilter(event: Event): void {
    this.assetClassFilter.set((event.target as HTMLSelectElement).value as AssetClassFilter);
  }

  protected signed(value: number, digits: number): string {
    return `${value > 0 ? '+' : ''}${value.toFixed(digits)}`;
  }
}
