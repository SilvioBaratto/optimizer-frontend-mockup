import { ChangeDetectionStrategy, Component, computed, inject, signal } from '@angular/core';

import {
  ATTRIBUTION_CONFIDENCES,
  ATTRIBUTION_GROUPINGS,
  ATTRIBUTION_GROUPING_LABEL,
  ATTRIBUTION_GROUPING_NOUN,
  ATTRIBUTION_MEASURES,
  ATTRIBUTION_MEASURE_LABEL,
  ATTRIBUTION_METHODS,
  ATTRIBUTION_METHOD_LABEL,
  DISPLAY_UNITS,
  DISPLAY_UNIT_LABEL,
  ESTIMATION_APPROACHES,
  ESTIMATION_APPROACH_LABEL,
  type AttributionConfidence,
  type AttributionGrouping,
  type AttributionMeasure,
  type AttributionMethod,
  type AttributionParameter,
  type DisplayUnit,
  type EstimationApproach,
} from '../../../../models/risk-attribution.model';
import { RiskAttributionService } from '../../../../services/risk-attribution.service';
import {
  SegmentedControl,
  type SegmentedOption,
} from '../../../../shared/segmented-control/segmented-control';
import { ButtonDirective } from '../../../../shared/ui/button/button.directive';
import { SelectDirective } from '../../../../shared/ui/select/select.directive';

/**
 * Why the control that is being recomputed cannot be touched.
 *
 * It rides the same `disabledReason` channel as the measure-incompatibility
 * reasons, so a screen reader hears why a control is inert from the same place
 * whichever reason is in force.
 */
const RECOMPUTING_REASON =
  'Recomputing the decomposition for this parameter — the rest of the toolbar stays usable.';

const PARAMETER_LABEL: Record<AttributionParameter, string> = {
  measure: 'risk measure',
  confidence: 'confidence level',
  method: 'attribution method',
  approach: 'estimation approach',
  grouping: 'grouping',
  snapshot: 'snapshot',
};

/**
 * Region 1 — the toolbar that drives the whole page.
 *
 * Six of its controls change the numbers and each one is an `await`: the spec
 * requires a loading state, so the service's setters are asynchronous and the
 * control that triggered the recompute is the only one that goes inert while
 * it runs. Two more — the search field and the `$ / %` switch — change nothing
 * but the rendering, and they are wired to plain writable signals with no path
 * into `recompute` at all.
 *
 * The rule the spec is most explicit about is what happens to a control that
 * does not apply. Confidence has no meaning for volatility, which is a moment
 * and not a quantile, and the estimation approach has none for anything but
 * VaR. Neither disappears: both stay visible, stay in the reading order, and
 * carry `aria-disabled` with the reason exposed through `aria-describedby`, so
 * the layout does not reflow under the reader and nobody has to guess why the
 * control stopped responding. `app-segmented-control` implements exactly that
 * contract, which is why the pickers here are radiogroups rather than selects.
 */
@Component({
  selector: 'app-attribution-toolbar',
  imports: [ButtonDirective, SegmentedControl, SelectDirective],
  templateUrl: './attribution-toolbar.html',
  host: { class: 'flex flex-col gap-3' },
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class AttributionToolbar {
  private readonly service = inject(RiskAttributionService);

  protected readonly groupings = ATTRIBUTION_GROUPINGS;
  protected readonly groupingLabel = ATTRIBUTION_GROUPING_LABEL;
  protected readonly snapshots = this.service.snapshots;

  protected readonly measure = this.service.measure;
  protected readonly method = this.service.method;
  protected readonly approach = this.service.approach;
  protected readonly grouping = this.service.grouping;
  protected readonly snapshotId = this.service.snapshotId;
  protected readonly search = this.service.search;
  protected readonly displayUnit = this.service.displayUnit;
  protected readonly pendingParameter = this.service.pendingParameter;

  /** `SegmentedControl` speaks strings; the confidence level is a number. */
  protected readonly confidenceValue = computed(() => String(this.service.confidence()));

  protected readonly measureOptions = computed<SegmentedOption[]>(() =>
    ATTRIBUTION_MEASURES.map((value) => ({
      value,
      label: ATTRIBUTION_MEASURE_LABEL[value],
      ...this.pendingOn('measure'),
    })),
  );

  /**
   * Every option carries the same reason when the measure has no quantile.
   *
   * Disabling the group rather than hiding it is the spec's requirement, and
   * the reason travels per option because that is the element a reader lands
   * on — a single note beside the group would be read after the control it
   * explains, or not at all.
   */
  protected readonly confidenceOptions = computed<SegmentedOption[]>(() => {
    const unavailable = this.service.confidenceDisabledReason();
    return ATTRIBUTION_CONFIDENCES.map((level) => ({
      value: String(level),
      label: `${level}%`,
      ...(unavailable
        ? { disabled: true, disabledReason: unavailable }
        : this.pendingOn('confidence')),
    }));
  });

  protected readonly methodOptions = computed<SegmentedOption[]>(() =>
    ATTRIBUTION_METHODS.map((value) => ({
      value,
      label: ATTRIBUTION_METHOD_LABEL[value],
      ...this.pendingOn('method'),
    })),
  );

  protected readonly approachOptions = computed<SegmentedOption[]>(() => {
    const unavailable = this.service.approachDisabledReason();
    return ESTIMATION_APPROACHES.map((value) => ({
      value,
      label: ESTIMATION_APPROACH_LABEL[value],
      ...(unavailable
        ? { disabled: true, disabledReason: unavailable }
        : this.pendingOn('approach')),
    }));
  });

  /** Formatting only — never disabled, because it never recomputes anything. */
  protected readonly displayUnitOptions: SegmentedOption[] = DISPLAY_UNITS.map((value) => ({
    value,
    label: DISPLAY_UNIT_LABEL[value],
  }));

  /** Which control the inline spinner sits on, in words. */
  protected readonly pendingLabel = computed(() => {
    const parameter = this.pendingParameter();
    return parameter === null ? '' : PARAMETER_LABEL[parameter];
  });

  // --- the six parameters that recompute ------------------------------------

  protected onMeasure(value: string): void {
    void this.service.setMeasure(value as AttributionMeasure);
  }

  protected onConfidence(value: string): void {
    void this.service.setConfidence(Number(value) as AttributionConfidence);
  }

  protected onMethod(value: string): void {
    void this.service.setMethod(value as AttributionMethod);
  }

  protected onApproach(value: string): void {
    void this.service.setApproach(value as EstimationApproach);
  }

  /**
   * `aria-disabled`, never the `disabled` attribute.
   *
   * These two are the only controls the reader operates *from the keyboard on
   * the element itself* — a segmented control is a button the browser leaves
   * alone. Setting `disabled` on a `<select>` the user has just changed removes
   * the focused element from the tab order, and the browser drops focus to
   * `<body>`; 700 ms later the control comes back and the reader is at the top
   * of the page with no way to know it. So the control stays focusable and
   * announced as disabled, and a change made while its own recompute is in
   * flight is refused here and the visible value put back.
   */
  protected onGrouping(event: Event): void {
    const select = event.target as HTMLSelectElement;
    if (this.pendingParameter() === 'grouping') {
      select.value = this.grouping();
      return;
    }
    void this.service.setGrouping(select.value as AttributionGrouping);
  }

  protected onSnapshot(event: Event): void {
    const select = event.target as HTMLSelectElement;
    if (this.pendingParameter() === 'snapshot') {
      select.value = this.snapshotId();
      return;
    }
    void this.service.setSnapshot(select.value);
  }

  /** True for the one control whose recompute is in flight. */
  protected isPending(parameter: AttributionParameter): boolean {
    return this.pendingParameter() === parameter;
  }

  // --- the two that only change the rendering -------------------------------

  protected onSearch(event: Event): void {
    this.search.set((event.target as HTMLInputElement).value);
  }

  protected onDisplayUnit(value: string): void {
    this.displayUnit.set(value as DisplayUnit);
  }

  // --- export ---------------------------------------------------------------

  private readonly _exportNotice = signal('');
  /** Announced politely; the mock has no file system to write to. */
  protected readonly exportNotice = this._exportNotice.asReadonly();

  /**
   * The spec's "export the current view": the parameters travel with the rows,
   * because a table of contributions with no measure, method or as-of date
   * beside it is a column of numbers nobody can reproduce.
   */
  protected exportTable(): void {
    const noun = ATTRIBUTION_GROUPING_NOUN[this.grouping()];
    this._exportNotice.set(
      `Exported ${this.service.rows().length} ${noun} — ${this.service.parameterSummary()}, ` +
        `grouped by ${ATTRIBUTION_GROUPING_LABEL[this.grouping()].toLowerCase()}, ` +
        `as of ${this.service.snapshot().label}.`,
    );
  }

  private pendingOn(parameter: AttributionParameter): Partial<SegmentedOption> {
    return this.pendingParameter() === parameter
      ? { disabled: true, disabledReason: RECOMPUTING_REASON }
      : {};
  }
}
