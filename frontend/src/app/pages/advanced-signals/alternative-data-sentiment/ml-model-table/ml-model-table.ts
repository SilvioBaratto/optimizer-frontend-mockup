import { ChangeDetectionStrategy, Component, computed, inject } from '@angular/core';

import {
  ML_PREDICTOR_NOTE,
  ML_R2_NOTE,
  type MlModelRow,
} from '../../../../models/alt-data-sentiment.model';
import { AltDataSentimentService } from '../../../../services/alt-data-sentiment.service';
import { NOT_APPLICABLE, icLabel, percent0, percent2 } from '../alt-data-format';

/**
 * Region 12 — the candidate models for the aggregation.
 *
 * Two columns are the argument of the whole tab. `R² oos` is measured against
 * zero rather than against the historical mean, so the unregularised regression
 * reading −3.46% is not merely worse than its rivals — it is worse than
 * predicting no premium at all. And because it forecasts nothing, it has no
 * information coefficient to quote and takes no weight: both cells print an em
 * dash rather than a zero, because a zero would be a measurement nobody made.
 *
 * The weights are a distribution over the models that survive, so the column
 * sums to 100% and the footer says so. A row is selectable through a real
 * button in its row header — the pointer affordance the spec asks for, reachable
 * from the keyboard without inventing a focus model for `<tr>`.
 */
@Component({
  selector: 'app-alt-data-ml-model-table',
  templateUrl: './ml-model-table.html',
  host: { class: 'block' },
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class AltDataMlModelTable {
  private readonly service = inject(AltDataSentimentService);

  protected readonly notApplicable = NOT_APPLICABLE;
  protected readonly predictorNote = ML_PREDICTOR_NOTE;
  protected readonly r2Note = ML_R2_NOTE;

  protected readonly rows = this.service.mlModels;
  protected readonly selectedId = this.service.selectedModelId;

  protected readonly totalWeight = computed(() =>
    this.rows.reduce((sum, row) => sum + row.weight, 0),
  );

  protected r2(row: MlModelRow): string {
    return percent2(row.r2Oos);
  }

  protected ic(row: MlModelRow): string {
    return row.ic === null ? this.notApplicable : icLabel(row.ic);
  }

  protected weight(row: MlModelRow): string {
    return percent0(row.weight);
  }

  protected note(row: MlModelRow): string {
    return row.note === '' ? this.notApplicable : row.note;
  }

  protected select(row: MlModelRow): void {
    this.service.selectModel(row.id);
  }
}
