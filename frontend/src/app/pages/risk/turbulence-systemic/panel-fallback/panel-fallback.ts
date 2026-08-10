import { ChangeDetectionStrategy, Component, computed, inject, input } from '@angular/core';

import {
  TURBULENCE_PANEL_LABEL,
  type TurbulencePanelId,
} from '../../../../models/turbulence.model';
import { TurbulenceService } from '../../../../services/turbulence.service';
import { ErrorState } from '../../../../shared/error-state/error-state';
import { SkeletonBlock } from '../../../../shared/skeleton-block/skeleton-block';

/**
 * What a panel shows while it has no figures of its own.
 *
 * Nine panels compute independently on this page, and each of them can be
 * loading or failed while its neighbours are neither — that is the whole point
 * of the service holding errors against a panel rather than against the page.
 * Written once here so the nine cannot drift into nine slightly different
 * spellings of the same two states.
 *
 * The failure is a background computation rather than something the reader just
 * did, so it is announced politely (`cause="load"` → `role="status"`), and the
 * retry re-runs *this* panel: `refreshPanel` leaves the other eight with their
 * status and their data.
 *
 * `height` is the height of the content this stands in for, passed as a literal
 * Tailwind class by each call site — an interpolated `h-${n}` would be invisible
 * to the v4 source scan and the rule would silently never be emitted.
 *
 * The card adds 66px of its own to whatever it is given: 16px of padding top
 * and bottom, the 20px title line, the 12px gap under it and 2px of border. So
 * a call site that wants to hold `P` pixels open passes `P − 66`. The spec asks
 * for "uno SkeletonBlock della stessa altezza del contenuto finale", and the
 * only way to mean it is to measure the panel and subtract the frame.
 */
@Component({
  selector: 'app-turbulence-panel-fallback',
  imports: [ErrorState, SkeletonBlock],
  templateUrl: './panel-fallback.html',
  host: { class: 'block' },
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class PanelFallback {
  readonly panel = input.required<TurbulencePanelId>();
  /** Tailwind height utility matching the panel it replaces. */
  readonly height = input('h-72');

  private readonly service = inject(TurbulenceService);

  protected readonly label = computed(() => TURBULENCE_PANEL_LABEL[this.panel()]);

  protected readonly failure = computed(() =>
    this.service.panelErrors().find((error) => error.panel === this.panel()) ?? null,
  );

  /**
   * Whether this placeholder speaks for itself.
   *
   * It does when one panel is recomputing — that is a change the reader asked
   * for and cannot see. It does not when the whole page is: nine polite
   * regions firing at once is nine announcements of the same event, and the
   * grid above already says it in one line. `aria-busy` on the box stays either
   * way, which is what carries "this content is not final".
   */
  protected readonly announce = computed(() => this.service.state() !== 'loading');

  protected retry(): void {
    void this.service.refreshPanel(this.panel());
  }
}
