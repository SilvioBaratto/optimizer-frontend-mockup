import { ChangeDetectionStrategy, Component, inject, signal } from '@angular/core';

import { AllocationAgentService } from '../../../../services/allocation-agent.service';

/**
 * What the agent did in this run, in order.
 *
 * The log records the steps, not the intentions: a failed publish is written as
 * a failed publish, so the trace can never be read as evidence that the fund
 * state was updated. Collapsed by default — it is the record you consult when
 * something looks wrong, not the first thing on the page.
 */
@Component({
  selector: 'app-run-log',
  templateUrl: './run-log.html',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class RunLog {
  private readonly service = inject(AllocationAgentService);

  protected readonly entries = this.service.log;
  protected readonly status = this.service.status;

  protected readonly expanded = signal(false);
}
