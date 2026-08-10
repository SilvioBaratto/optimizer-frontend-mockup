import { ChangeDetectionStrategy, Component, computed, inject, signal } from '@angular/core';

import {
  PAIR_ONLY_NOTE,
  PAIR_ZERO_RHO_NOTE,
  type UniverseAsset,
} from '../../../../models/turbulence.model';
import { TurbulenceService } from '../../../../services/turbulence.service';
import { BulletChartComponent } from '../../../../shared/charts';
import type { BulletRow } from '../../../../shared/charts';
import { SelectDirective } from '../../../../shared/ui/select/select.directive';
import { CoverageNote } from '../coverage-note/coverage-note';
import { PanelFallback } from '../panel-fallback/panel-fallback';
import { fixed, score } from '../turbulence-format';

/** Below this |ρ| the bounds have collapsed onto one another. */
const FLAT_RHO = 0.005;

/**
 * Region 7 — correlation surprise for one pair, on its own bounded track.
 *
 * The measure is defined for a pair and the panel says so rather than hiding
 * the restriction: for a single asset the turbulence is `z²`, every unit of
 * magnitude cancels in the ratio and the surprise is one by construction. So
 * `X = Y` is refused — not silently swapped, not quietly accepted — and the
 * refusal is announced beside the control that made it.
 *
 * Every number in the readout is a function of the three inputs above it.
 * `CS = (1 − ρ z_x z_y / ½(z_x² + z_y²)) / (1 − ρ²)`, `min = (1−|ρ|)/(1−ρ²)`,
 * `max = (1+|ρ|)/(1−ρ²)`, and the marker's position is where `CS` falls between
 * them. The doc carries a blocking review because a wireframe printed a surprise
 * and a pair of bounds that its own `z_x`, `z_y` and `ρ` could not produce;
 * nothing here can repeat that, because nothing here is stored.
 *
 * The selectors are a search field over a native `<select>` rather than a
 * bespoke combobox: with a two-dozen-name universe the filter is what makes the
 * list usable, and the select keeps the platform's own keyboard behaviour,
 * labelling and mobile picker.
 */
@Component({
  selector: 'app-turbulence-pairwise-inspector',
  imports: [BulletChartComponent, CoverageNote, PanelFallback, SelectDirective],
  templateUrl: './pairwise-inspector.html',
  host: { class: 'block' },
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class PairwiseInspector {
  private readonly service = inject(TurbulenceService);

  protected readonly pairOnlyNote = PAIR_ONLY_NOTE;
  protected readonly formatter = score;

  protected readonly ready = computed(() => this.service.panelStatus().pairwise === 'ready');
  protected readonly coverage = this.service.correlationCoverage;
  protected readonly pairNote = this.service.pairNote;
  protected readonly pairwise = this.service.pairwise;
  protected readonly assetX = this.service.assetX;
  protected readonly assetY = this.service.assetY;

  /** Filter text per side. Narrows the list only; it selects nothing. */
  protected readonly filterX = signal('');
  protected readonly filterY = signal('');

  protected readonly optionsX = computed(() => this.filtered(this.filterX(), this.assetX()));
  protected readonly optionsY = computed(() => this.filtered(this.filterY(), this.assetY()));

  /**
   * The list a side offers.
   *
   * The current selection is always in it, whatever the filter says: a `<select>`
   * whose value is not among its options shows the first one instead, which
   * would silently misreport the pair the readout below is describing.
   */
  private filtered(needle: string, current: string): readonly UniverseAsset[] {
    const assets = this.service.assets();
    const text = needle.trim().toLowerCase();
    if (!text) return assets;
    return assets.filter(
      (asset) =>
        asset.id === current ||
        asset.id.toLowerCase().includes(text) ||
        asset.name.toLowerCase().includes(text),
    );
  }

  /** Two places with a real minus sign, so the readout column stays aligned. */
  protected two(value: number): string {
    return fixed(value, 2);
  }

  /** `ρ = 0` collapses the bounds onto one, and the panel says what that means. */
  protected readonly flatRhoNote = computed(() =>
    Math.abs(this.pairwise().rho) < FLAT_RHO ? PAIR_ZERO_RHO_NOTE : null,
  );

  protected readonly rows = computed<readonly BulletRow[]>(() => {
    const pair = this.pairwise();
    return [
      {
        label: `${pair.assetX} vs ${pair.assetY}`,
        value: pair.correlationSurprise,
        min: pair.min,
        max: pair.max,
        status: pair.breakdown ? 'above one' : 'below one',
      },
    ];
  });

  protected readonly domainMin = computed(() => this.pairwise().min);
  protected readonly domainMax = computed(() => this.pairwise().max);

  protected readonly subtitle = computed(() => {
    const pair = this.pairwise();
    return `z_x ${fixed(pair.zX, 2)} · z_y ${fixed(pair.zY, 2)} · rho ${fixed(pair.rho, 2)} historical`;
  });

  protected readonly ariaLabel = computed(() => {
    const pair = this.pairwise();
    return (
      `Correlation surprise for ${pair.assetX} against ${pair.assetY}, on a track bounded by the ` +
      `values the observed correlation allows. z_x ${fixed(pair.zX, 2)}, z_y ${fixed(pair.zY, 2)}, ` +
      `historical rho ${fixed(pair.rho, 2)}. Correlation surprise ${score(pair.correlationSurprise)}, ` +
      `between a minimum of ${score(pair.min)} and a maximum of ${score(pair.max)} — ` +
      `${pair.verdict}. The measure is defined for a pair only.`
    );
  });

  protected onFilterX(event: Event): void {
    this.filterX.set((event.target as HTMLInputElement).value);
  }

  protected onFilterY(event: Event): void {
    this.filterY.set((event.target as HTMLInputElement).value);
  }

  /**
   * Sets one side, and puts the control back when the service refuses.
   *
   * The refusal leaves the signal untouched, so without this the `<select>`
   * would keep showing an asset the readout is not describing — the one way a
   * page like this can lie without printing a wrong number.
   */
  protected onSelectX(event: Event): void {
    const element = event.target as HTMLSelectElement;
    if (!this.service.selectAssetX(element.value)) element.value = this.assetX();
  }

  protected onSelectY(event: Event): void {
    const element = event.target as HTMLSelectElement;
    if (!this.service.selectAssetY(element.value)) element.value = this.assetY();
  }
}
