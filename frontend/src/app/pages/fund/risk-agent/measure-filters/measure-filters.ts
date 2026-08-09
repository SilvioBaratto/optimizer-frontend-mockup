import { ChangeDetectionStrategy, Component, computed, inject } from '@angular/core';

import {
  CONFIDENCE_DEFINITION,
  CONFIDENCE_LABEL,
  CONFIDENCE_LEVELS,
  FILTER_NOTE,
  VAR_METHODS,
  VAR_METHOD_DEFINITION,
  VAR_METHOD_LABEL,
  type ConfidenceLevel,
  type VarMethod,
} from '../../../../models/risk-verdict.model';
import { RiskAgentService } from '../../../../services/risk-agent.service';
import { FilterChipBar } from '../../../../shared/filter-chip-bar/filter-chip-bar';
import {
  SegmentedControl,
  type SegmentedOption,
} from '../../../../shared/segmented-control/segmented-control';

const CONFIDENCE_OPTIONS: readonly SegmentedOption[] = CONFIDENCE_LEVELS.map((level) => ({
  value: String(level),
  label: CONFIDENCE_LABEL[level],
}));

const METHOD_OPTIONS: readonly SegmentedOption[] = VAR_METHODS.map((method) => ({
  value: method,
  label: VAR_METHOD_LABEL[method],
}));

/**
 * Region 5 — the two display filters.
 *
 * Neither of these recomputes anything. The tool produced every combination
 * once, deterministically; these chips choose which of them is on screen. The
 * service backs them with plain signals feeding a `computed()`, so there is no
 * call path from either control into a run, and the note under the bar says so
 * in words as well.
 *
 * Both are radiogroups rather than rows of toggle buttons — one tab stop,
 * arrows inside, `aria-checked` on the options — which is what the shared
 * `app-segmented-control` implements.
 */
@Component({
  selector: 'app-measure-filters',
  imports: [FilterChipBar, SegmentedControl],
  templateUrl: './measure-filters.html',
  host: { class: 'block' },
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class MeasureFilters {
  private readonly service = inject(RiskAgentService);

  protected readonly confidenceOptions = CONFIDENCE_OPTIONS;
  protected readonly methodOptions = METHOD_OPTIONS;
  protected readonly filterNote = FILTER_NOTE;

  protected readonly measuresLabel = this.service.measuresLabel;

  /** `SegmentedControl` speaks strings; the level is a number. */
  protected readonly confidenceValue = computed(() => String(this.service.confidence()));
  protected readonly methodValue = computed<string>(() => this.service.method());

  protected readonly confidenceDefinition = computed(
    () => CONFIDENCE_DEFINITION[this.service.confidence()],
  );
  protected readonly methodDefinition = computed(() => VAR_METHOD_DEFINITION[this.service.method()]);

  protected onConfidence(value: string): void {
    this.service.confidence.set(Number(value) as ConfidenceLevel);
  }

  protected onMethod(value: string): void {
    this.service.method.set(value as VarMethod);
  }
}
