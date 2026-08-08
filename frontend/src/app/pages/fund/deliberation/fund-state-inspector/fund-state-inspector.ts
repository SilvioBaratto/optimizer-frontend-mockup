import { ChangeDetectionStrategy, Component, inject, signal } from '@angular/core';

import { StatusBadge } from '../../../../shared/status-badge/status-badge';
import type { FundStateField } from '../../../../models/fund-state.model';
import { DeliberationService } from '../../../../services/deliberation.service';

/**
 * The five fields of `FundState`, as of the checkpoint being inspected.
 *
 * Exactly five rows, one writer each, and no inference: a field that is empty
 * is shown empty even mid-run, because the state is the record and guessing at
 * a value the agents have not written would make it a worse one.
 */
@Component({
  selector: 'app-fund-state-inspector',
  imports: [StatusBadge],
  templateUrl: './fund-state-inspector.html',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class FundStateInspector {
  private readonly service = inject(DeliberationService);

  protected readonly fields = this.service.fields;
  protected readonly activeCheckpoint = this.service.activeCheckpoint;
  protected readonly isHistoric = this.service.isHistoric;

  /** Which row has its detail open; only rows that are set can open one. */
  protected readonly openField = signal<FundStateField | null>(null);

  protected toggle(field: FundStateField, isSet: boolean): void {
    if (!isSet) return;
    this.openField.update((open) => (open === field ? null : field));
  }

  /** `set (12)` for a tuple field that has elements, plain `set` otherwise. */
  protected stateLabel(set: boolean, count: number | null): string {
    if (!set) return 'empty';
    return count === null ? 'set' : `set (${count})`;
  }
}
