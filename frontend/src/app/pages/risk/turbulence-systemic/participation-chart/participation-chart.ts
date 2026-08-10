import { ChangeDetectionStrategy, Component, computed, inject } from '@angular/core';

import {
  PARTICIPATION_SCALE_NOTE,
  PARTICIPATION_STATE_ICON,
  PARTICIPATION_STATE_LABEL,
} from '../../../../models/turbulence.model';
import { TurbulenceService } from '../../../../services/turbulence.service';
import { LineChartComponent } from '../../../../shared/charts';
import type { CategorySeries, RefPoint } from '../../../../shared/charts';
import { CoverageNote } from '../coverage-note/coverage-note';
import { PanelFallback } from '../panel-fallback/panel-fallback';
import { oneDecimal } from '../turbulence-format';

/**
 * Region 13 — how much of the market the first component actually involves.
 *
 * `I₁ = Σ ω₁ᵢ⁴` and the participation ratio is `1/I₁`: identical contributions
 * from all `N` assets give `1/I₁ = N`, a single non-zero loading gives one. The
 * scale is therefore read as localized → extended, and the distinction matters
 * more than the level — a correlation increase confined to one asset class is a
 * different event from one that spreads across the whole book, and only the
 * second makes diversifying between classes materially harder.
 *
 * The current state is a word and a glyph beside the number, never a position
 * on a coloured scale.
 *
 * This panel is deliberately not sliced by the toolbar's range: the count of
 * significant components it reports is read off the same spectrum the
 * absorption ratio and the PC1 share come from, and a display window has no
 * business changing it.
 */
@Component({
  selector: 'app-turbulence-participation-chart',
  imports: [CoverageNote, LineChartComponent, PanelFallback],
  templateUrl: './participation-chart.html',
  host: { class: 'block' },
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class ParticipationChart {
  private readonly service = inject(TurbulenceService);

  protected readonly formatter = oneDecimal;
  protected readonly scaleNote = PARTICIPATION_SCALE_NOTE;
  protected readonly stateLabel = PARTICIPATION_STATE_LABEL;
  protected readonly stateIcon = PARTICIPATION_STATE_ICON;

  protected readonly ready = computed(() => this.service.panelStatus().participation === 'ready');
  protected readonly coverage = this.service.correlationCoverage;
  protected readonly reading = this.service.participation;

  protected readonly dates = computed(() =>
    this.service.participationSeries().map((point) => point.date),
  );

  protected readonly series = computed<readonly CategorySeries[]>(() => [
    {
      name: 'Participation ratio 1/I1',
      data: this.service.participationSeries().map((point) => point.participationRatio),
    },
  ]);

  protected readonly refPoints = computed<readonly RefPoint[]>(() => {
    const points = this.service.participationSeries();
    const last = points[points.length - 1];
    if (!last) return [];
    const reading = this.reading();
    return [
      {
        x: last.date,
        y: last.participationRatio,
        label: `${oneDecimal(last.participationRatio)} ${PARTICIPATION_STATE_LABEL[reading.state].toLowerCase()}`,
      },
    ];
  });

  protected readonly subtitle = computed(() => {
    const reading = this.reading();
    return (
      `1/I1 ${oneDecimal(reading.participationRatio)} of ${reading.assetCount} — ` +
      `${PARTICIPATION_STATE_LABEL[reading.state].toLowerCase()} · significant components ` +
      `${reading.significantComponents}`
    );
  });

  protected readonly ariaLabel = computed(() => {
    const reading = this.reading();
    const points = this.service.participationSeries();
    const first = points[0];
    const last = points[points.length - 1];
    if (!first || !last) return 'Participation ratio: no observations.';

    const direction =
      last.participationRatio > first.participationRatio
        ? 'rises'
        : last.participationRatio < first.participationRatio
          ? 'falls'
          : 'is flat';

    return (
      `Participation ratio of the first component, 1 over I1, through time on a scale that runs ` +
      `from one — a single asset carrying the whole component — to ${reading.assetCount}, every ` +
      `asset contributing equally. It ${direction} from ${oneDecimal(first.participationRatio)} ` +
      `to ${oneDecimal(last.participationRatio)}, which reads as ` +
      `${PARTICIPATION_STATE_LABEL[reading.state].toLowerCase()}. I1 itself is ` +
      `${reading.inverseParticipationRatio.toFixed(3)}. The Kaiser-Guttman count of significant ` +
      `components is ${reading.significantComponents}.`
    );
  });
}
