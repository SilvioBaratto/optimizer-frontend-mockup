import { ChangeDetectionStrategy, Component, computed, inject } from '@angular/core';

import { SPECTRUM_BOUND_NOTE } from '../../../../models/turbulence.model';
import { TurbulenceService } from '../../../../services/turbulence.service';
import { BarChartComponent } from '../../../../shared/charts';
import type { CategorySeries, RefLine } from '../../../../shared/charts';
import { SelectDirective } from '../../../../shared/ui/select/select.directive';
import { CoverageNote } from '../coverage-note/coverage-note';
import { PanelFallback } from '../panel-fallback/panel-fallback';
import { score } from '../turbulence-format';

/** Marks a bar that carries structure random price changes cannot produce. */
const ABOVE_BOUND_GLYPH = '▲';

/** Pixels per bar, so a 12-asset sleeve and a 24-asset book both read well. */
const ROW_HEIGHT = 20;
const CHART_PADDING = 80;

/**
 * Region 12 — the current spectrum against the random-matrix bulk.
 *
 * `γ± = σ²(1 + 1/Q ± 2√(1/Q))` with `Q = T/N` is the edge of the eigenvalue
 * density a matrix of uncorrelated series would produce. Everything inside it
 * is indistinguishable from noise; everything past `γ₊` is structure. The
 * second line is Kaiser-Guttman, `λ > 1`, and the two are different criteria
 * that can cross — the panel prints both counts and names each rather than
 * implying one is a refinement of the other.
 *
 * Above-bound bars are marked in their own axis label with `▲`, not by colour:
 * a hue would say nothing in greyscale and nothing at all in the panel's
 * tabular alternative, where the label is the row's name. The bars also
 * visibly cross the drawn `γ₊` line, which is the same statement twice — on
 * purpose.
 *
 * The window selector re-reads the spectrum at another date and touches nothing
 * else on the page: the compactness readings above are taken from the latest
 * window, which is what keeps this panel a historical comparison rather than a
 * second, competing source for the current absorption ratio.
 */
@Component({
  selector: 'app-turbulence-eigen-spectrum',
  imports: [BarChartComponent, CoverageNote, PanelFallback, SelectDirective],
  templateUrl: './eigen-spectrum.html',
  host: { class: 'block' },
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class EigenSpectrum {
  private readonly service = inject(TurbulenceService);

  protected readonly formatter = score;
  protected readonly boundNote = SPECTRUM_BOUND_NOTE;
  protected readonly aboveGlyph = ABOVE_BOUND_GLYPH;

  protected readonly ready = computed(() => this.service.panelStatus().spectrum === 'ready');
  protected readonly coverage = this.service.correlationCoverage;
  protected readonly windows = this.service.spectrumWindows;
  protected readonly windowId = this.service.spectrumWindowId;
  protected readonly spectrum = this.service.spectrum;

  protected readonly categories = computed<readonly string[]>(() =>
    this.spectrum().eigenvalues.map(
      (eigenvalue) =>
        `lambda ${eigenvalue.index}${eigenvalue.aboveBound ? ` ${ABOVE_BOUND_GLYPH}` : ''}`,
    ),
  );

  protected readonly series = computed<readonly CategorySeries[]>(() => [
    { name: 'Eigenvalue', data: this.spectrum().eigenvalues.map((eigenvalue) => eigenvalue.value) },
  ]);

  protected readonly refLines = computed<readonly RefLine[]>(() => {
    const spectrum = this.spectrum();
    return [
      {
        value: spectrum.gammaPlus,
        axis: 'x',
        label: `gamma+ ${score(spectrum.gammaPlus)}`,
        dashed: true,
      },
      { value: 1, axis: 'x', label: 'Kaiser-Guttman 1.00', dashed: true },
    ];
  });

  protected readonly height = computed(
    () => this.spectrum().eigenvalues.length * ROW_HEIGHT + CHART_PADDING,
  );

  protected readonly subtitle = computed(() => {
    const spectrum = this.spectrum();
    return (
      `Window ending ${spectrum.endingOn} · ${spectrum.aboveBound} above gamma+ · ` +
      `${spectrum.significant} with lambda > 1`
    );
  });

  protected readonly ariaLabel = computed(() => {
    const spectrum = this.spectrum();
    const lead = spectrum.eigenvalues[0];
    return (
      `Eigenvalue spectrum of the correlation matrix for the window ending ` +
      `${spectrum.endingOn}, ${spectrum.eigenvalues.length} eigenvalues summing to the asset ` +
      `count. The largest is ${score(lead?.value ?? 0)}, which is ` +
      `${Math.round((lead?.varianceShare ?? 0) * 100)}% of the total variance. With T = ` +
      `${spectrum.observations} observations on N = ${spectrum.assets} assets, Q is ` +
      `${score(spectrum.q)} and the Wishart bound gamma-plus is ${score(spectrum.gammaPlus)}: ` +
      `${spectrum.aboveBound} eigenvalues sit above it and carry structure, the rest are ` +
      `indistinguishable from noise. ${spectrum.significant} satisfy the Kaiser-Guttman ` +
      `criterion of lambda greater than one.`
    );
  });

  protected onWindow(event: Event): void {
    this.service.setSpectrumWindow((event.target as HTMLSelectElement).value);
  }
}
