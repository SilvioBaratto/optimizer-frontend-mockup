import { ChangeDetectionStrategy, Component, computed, inject } from '@angular/core';
import { Router } from '@angular/router';

import {
  CANDIDATES_QUERY_PARAM,
  SEND_DISABLED_REASON,
  VIEWS_BUILDER_ROUTE,
} from '../../../../models/alt-data-sentiment.model';
import { AltDataSentimentService } from '../../../../services/alt-data-sentiment.service';
import { ButtonDirective } from '../../../../shared/ui/button/button.directive';
import { CollectionStatBar } from '../../../../shared/collection-stat-bar/collection-stat-bar';

/**
 * Region 14 — the selection count and the page's primary action.
 *
 * It counts the *inclusion* set and nothing else. The card driving the detail
 * panel is not counted here and never has been: a reader who has opened five
 * signals in a row and ticked none of them has selected nothing, and a footer
 * that said otherwise would send a signal nobody chose.
 *
 * The hand-over is a navigation, not a mutation: Views Builder receives the ids
 * as candidates in the URL and the reader refines them there. Nothing on this
 * page is written, deleted or overwritten by it, which is why the doc's
 * accessibility section is explicit that no confirmation is needed.
 */
@Component({
  selector: 'app-alt-data-selection-footer',
  imports: [ButtonDirective, CollectionStatBar],
  templateUrl: './selection-footer.html',
  host: { class: 'block' },
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class AltDataSelectionFooter {
  private readonly service = inject(AltDataSentimentService);
  private readonly router = inject(Router);

  protected readonly disabledReason = SEND_DISABLED_REASON;

  protected readonly count = this.service.includedCount;
  protected readonly total = this.service.totalCount;
  protected readonly included = this.service.includedSignals;

  protected readonly parts = computed(() => {
    const count = this.count();
    const noun = count === 1 ? 'signal' : 'signals';
    return [
      `${count} of ${this.total()} ${noun} selected`,
      this.service.universe().name,
    ];
  });

  protected readonly canSend = computed(() => this.count() > 0);

  protected readonly ctaLabel = computed(() =>
    this.canSend() ? `Send ${this.count()} to Views Builder` : 'Send to Views Builder',
  );

  /**
   * Hands the chosen signals over as candidates.
   *
   * The ids travel in the query string so the destination can be linked to,
   * bookmarked and reloaded with the same candidates — a payload held in
   * router state would not survive a refresh, and a reader who reloaded Views
   * Builder would find the candidates gone with no explanation.
   */
  protected send(): Promise<boolean> {
    if (!this.canSend()) return Promise.resolve(false);
    const candidates = this.included()
      .map((item) => item.id)
      .join(',');
    return this.router.navigate([VIEWS_BUILDER_ROUTE], {
      queryParams: { [CANDIDATES_QUERY_PARAM]: candidates },
    });
  }
}
