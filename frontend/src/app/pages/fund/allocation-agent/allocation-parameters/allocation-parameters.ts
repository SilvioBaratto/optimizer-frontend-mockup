import { ChangeDetectionStrategy, Component, computed, inject } from '@angular/core';

import { StatusBadge } from '../../../../shared/status-badge/status-badge';
import {
  APPROACH_LABEL,
  BENCHMARK_LABEL,
  CHARACTERISTIC_LABEL,
  DIRECT_METHOD_LABEL,
  REMEDY_LABEL,
  type BenchmarkWeights,
  type Characteristic,
  type DirectMethod,
  type EstimationApproach,
  type ObjectiveId,
  type Remedy,
} from '../../../../models/allocation-agent.model';
import { AllocationAgentService } from '../../../../services/allocation-agent.service';
import { MathVar } from '../../../../shared/math/math-var';
import { SelectDirective } from '../../../../shared/ui/select/select.directive';

const APPROACHES: readonly EstimationApproach[] = ['plug-in', 'direct'];
const REMEDIES: readonly Remedy[] = ['mean-shrinkage', 'covariance-shrinkage', 'factor-structure'];
const DIRECT_METHODS: readonly DirectMethod[] = ['parametric', 'state-index', 'nonparametric'];
const BENCHMARKS: readonly BenchmarkWeights[] = ['equal', 'cap', 'current'];
const CHARACTERISTICS: readonly Characteristic[] = ['value', 'momentum', 'size', 'quality', 'low-vol'];

/**
 * How the weights are to be obtained.
 *
 * Two things happen at different times here, and keeping them apart is the
 * point of the panel. Switching approach swaps the block below immediately,
 * because it changes which questions are even askable. Changing any value
 * inside a block changes nothing on the page: it marks the configuration
 * modified, and the weights stay the ones the last run actually solved — so
 * what gets published is always what was computed.
 */
@Component({
  selector: 'app-allocation-parameters',
  imports: [StatusBadge,
    MathVar,
    SelectDirective,
  ],
  templateUrl: './allocation-parameters.html',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class AllocationParameters {
  private readonly service = inject(AllocationAgentService);

  protected readonly approaches = APPROACHES;
  protected readonly approachLabel = APPROACH_LABEL;
  protected readonly remedyOptions = REMEDIES;
  protected readonly remedyLabel = REMEDY_LABEL;
  protected readonly directMethods = DIRECT_METHODS;
  protected readonly directMethodLabel = DIRECT_METHOD_LABEL;
  protected readonly benchmarks = BENCHMARKS;
  protected readonly benchmarkLabel = BENCHMARK_LABEL;
  protected readonly characteristicOptions = CHARACTERISTICS;
  protected readonly characteristicLabel = CHARACTERISTIC_LABEL;

  protected readonly approach = this.service.approach;
  protected readonly remedies = this.service.remedies;
  protected readonly objective = this.service.objective;
  protected readonly objectives = this.service.objectives;
  protected readonly activeObjective = this.service.activeObjective;
  protected readonly targetReturn = this.service.targetReturn;
  protected readonly riskFreeRate = this.service.riskFreeRate;
  protected readonly allowShortSelling = this.service.allowShortSelling;
  protected readonly positionLimit = this.service.positionLimit;
  protected readonly directMethod = this.service.directMethod;
  protected readonly benchmarkWeights = this.service.benchmarkWeights;
  protected readonly characteristics = this.service.characteristics;
  protected readonly modified = this.service.modified;

  /** Announced on its own, apart from the agent's status region. */
  protected readonly blockAnnouncement = computed(() =>
    this.approach() === 'plug-in'
      ? 'Plug-in, two-stage selected. Remedies and objective controls are shown.'
      : 'Direct weight modeling selected. The objective does not apply; direct method controls are shown.',
  );

  /** π is bounded below by the GMVP, and above by what long-only can reach. */
  protected readonly targetReturnInvalid = this.service.targetReturnInvalid;
  protected readonly targetBelowGmvp = this.service.targetBelowGmvp;
  protected readonly gmvpReturn = this.service.gmvpReturn;
  protected readonly longOnlyMaxReturn = this.service.longOnlyMaxReturn;

  protected onApproach(approach: EstimationApproach): void {
    this.approach.set(approach);
  }

  protected onObjective(event: Event): void {
    this.objective.set((event.target as HTMLSelectElement).value as ObjectiveId);
  }

  protected onDirectMethod(event: Event): void {
    this.directMethod.set((event.target as HTMLSelectElement).value as DirectMethod);
  }

  protected onBenchmark(event: Event): void {
    this.benchmarkWeights.set((event.target as HTMLSelectElement).value as BenchmarkWeights);
  }

  protected onNumber(event: Event, set: (value: number) => void, min: number, max: number): void {
    const value = Number((event.target as HTMLInputElement).value);
    if (Number.isNaN(value) || value < min || value > max) return;
    set(value);
  }

  protected toggleRemedy(remedy: Remedy): void {
    this.service.toggleRemedy(remedy);
  }

  protected toggleCharacteristic(characteristic: Characteristic): void {
    this.service.toggleCharacteristic(characteristic);
  }
}
