import {
  ChangeDetectionStrategy,
  Component,
  computed,
  inject,
  input,
  output,
  signal,
} from '@angular/core';

import { type LogEntry } from '../../../../models/risk-monitoring.model';
import { RiskMonitoringService } from '../../../../services/risk-monitoring.service';
import { EventLogPanel } from '../../../../shared/event-log-panel/event-log-panel';
import { ButtonDirective } from '../../../../shared/ui/button/button.directive';

/**
 * Region 7 — the alert & breach log.
 *
 * Truncated to the most recent three, as the wireframe draws it, with the rest
 * behind "View all alerts". The shared panel owns the list, the row buttons and
 * the region label; this adds the truncation and the detail line for whichever
 * entry was activated.
 *
 * The rows are handed a stamp and a sentence and nothing else. `EventLogPanel`
 * renders `LogEntry.detail` under every row it is given one for, which is right
 * for doc 15's run trace and wrong here: the wireframe draws one line per alert
 * and the spec says activating an entry *expands* its detail. Passing the
 * detail through would print all six measures, values and thresholds at once
 * and leave the activation with nothing left to reveal.
 *
 * Every entry is anchored to a real observation of the charts above — the
 * stamps are trading days of the drawdown path — which is what makes activating
 * one able to mark a point rather than gesture at a period. The detail line
 * says where the mark landed, because a dot drawn on a canvas is not something
 * a screen reader or a phone can be pointed at.
 */
@Component({
  selector: 'app-risk-monitoring-alert-log',
  imports: [ButtonDirective, EventLogPanel],
  templateUrl: './alert-log.html',
  host: { class: 'flex flex-col gap-2' },
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class AlertLog {
  private readonly service = inject(RiskMonitoringService);

  /** The entry currently marked on a chart, if any. */
  readonly selected = input<LogEntry | null>(null);

  /** Where the page put the mark — the panel does not decide that. */
  readonly selectedNote = input('');

  readonly entrySelected = output<LogEntry>();

  protected readonly showAll = signal(false);

  private readonly entries = computed(() =>
    this.showAll() ? this.service.alertLog() : this.service.recentAlerts(),
  );

  /** Stamp and sentence only — the detail is what activating a row reveals. */
  protected readonly rows = computed<readonly LogEntry[]>(() =>
    this.entries().map(({ id, at, text }) => ({ id, at, text })),
  );

  protected readonly hiddenCount = computed(
    () => this.service.alertLog().length - this.service.recentAlerts().length,
  );

  protected toggleAll(): void {
    this.showAll.set(!this.showAll());
  }

  /** The row carries no detail; the entry the page is handed must. */
  protected onSelect(row: LogEntry): void {
    this.entrySelected.emit(this.entries().find((entry) => entry.id === row.id) ?? row);
  }
}
