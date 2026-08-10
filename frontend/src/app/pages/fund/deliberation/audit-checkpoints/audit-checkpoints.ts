import { ChangeDetectionStrategy, Component, computed, inject } from '@angular/core';

import { AGENT_LABEL } from '../../../../models/fund-state.model';
import { DeliberationService } from '../../../../services/deliberation.service';
import { ButtonDirective } from '../../../../shared/ui/button/button.directive';

/**
 * The checkpoint history — the audit record (Fondamenti §4).
 *
 * Selecting a row inspects the state as it stood at that step; ticking two or
 * more rows compares them. The same frozen object serves both purposes, which
 * is the property the architecture is built around.
 */
@Component({
  selector: 'app-audit-checkpoints',
  imports: [ButtonDirective],
  templateUrl: './audit-checkpoints.html',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class AuditCheckpoints {
  private readonly service = inject(DeliberationService);

  protected readonly agentLabel = AGENT_LABEL;
  protected readonly checkpoints = this.service.checkpoints;
  protected readonly activeCheckpoint = this.service.activeCheckpoint;
  protected readonly comparisonSteps = this.service.comparisonSteps;
  protected readonly canCompare = this.service.canCompare;
  protected readonly compared = this.service.comparedCheckpoints;
  protected readonly hasRun = this.service.hasRun;

  /** Newest first, matching the way the spec lists them. */
  protected readonly rows = computed(() => [...this.checkpoints()].reverse());

  /** Showing the comparison only once two rows are actually ticked. */
  protected readonly showComparison = computed(() => this.compared().length >= 2);

  protected select(step: number): void {
    this.service.selectStep(step);
  }

  protected toggleCompare(step: number): void {
    this.service.toggleComparison(step);
  }

  protected clearComparison(): void {
    this.service.clearComparison();
  }

  protected isCompared(step: number): boolean {
    return this.comparisonSteps().includes(step);
  }

  /** `set` / `empty` for one field at one checkpoint, for the comparison grid. */
  protected valueAt(step: number, field: string): string {
    const checkpoint = this.checkpoints().find((c) => c.step === step);
    const row = checkpoint?.fields.find((f) => f.field === field);
    if (!row) return '—';
    if (!row.set) return 'empty';
    return row.count === null ? 'set' : `set (${row.count})`;
  }

  protected readonly fieldNames = computed(
    () => this.checkpoints()[0]?.fields.map((f) => f.field) ?? [],
  );

  /** Fields whose state differs across the compared checkpoints. */
  protected changed(field: string): boolean {
    const values = this.compared().map((c) => this.valueAt(c.step, field));
    return new Set(values).size > 1;
  }
}
