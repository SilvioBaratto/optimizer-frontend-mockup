import { ChangeDetectionStrategy, Component, inject } from '@angular/core';

import { CrossPageLink } from '../../../../shared/cross-page-link/cross-page-link';
import { EmptyState } from '../../../../shared/empty-state/empty-state';
import { AllocationAgentService } from '../../../../services/allocation-agent.service';

/**
 * The macro state vector z_t the agent read out of the shared state.
 *
 * Read-only on purpose: the allocation agent never calls the macro agent, it
 * reads what that agent published (ARCHITECTURE §7.3, Fondamenti §1). Without
 * a z_t there is nothing to optimise conditional on, which is why the empty
 * state here is the same condition that disables the run button.
 */
@Component({
  selector: 'app-macro-input',
  imports: [CrossPageLink, EmptyState],
  templateUrl: './macro-input.html',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class MacroInput {
  private readonly service = inject(AllocationAgentService);

  protected readonly input = this.service.macroInput;
}
