import {
  ChangeDetectionStrategy,
  Component,
  ElementRef,
  computed,
  inject,
  signal,
  viewChild,
} from '@angular/core';

import {
  GUARDRAIL_BANNER_ID,
  GUARDRAIL_DETAIL_LABEL,
  GUARDRAIL_DISMISS_LABEL,
} from '../../../../models/factor-timing.model';
import { FactorTimingService } from '../../../../services/factor-timing.service';

/**
 * Region 7 — the guardrail notice.
 *
 * Not `app-status-banner`, and the reason is the spec's rather than taste: the
 * shared banner has two variants, `success` — which would print "Success —
 * guardrails active" — and `error`, which is `role="alert"` and carries a Retry.
 * This notice is neither. Guardrails being in force is the page's *normal*
 * condition, there is nothing here to retry, and an assertive announcement on
 * every render would interrupt a reader for a state that has not changed.
 * `role="status"` with a polite live region is what the doc asks for: a
 * persistent, discreet notice.
 *
 * The dismissal is scoped rather than permanent, and that scoping is the whole
 * requirement. It records *which* conflict was on screen when the reader closed
 * it, so a different conflicted factor brings the notice back; and because the
 * service lives for the session, so does the dismissal — a reload restores it.
 * Nothing about the guardrails themselves is switched off by closing this: they
 * are constraints on the tilt, not a warning the reader can wave away.
 */
@Component({
  selector: 'app-factor-timing-guardrails',
  templateUrl: './guardrail-banner.html',
  host: { class: 'block' },
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class GuardrailBanner {
  private readonly service = inject(FactorTimingService);

  protected readonly bannerId = GUARDRAIL_BANNER_ID;
  protected readonly dismissLabel = GUARDRAIL_DISMISS_LABEL;
  protected readonly detailLabel = GUARDRAIL_DETAIL_LABEL;
  protected readonly notices = this.service.guardrailNotices;

  protected readonly visible = this.service.guardrailVisible;
  protected readonly detailOpen = signal(false);

  protected readonly conflicted = computed(() =>
    this.service.conflictedRows().map((row) => row.label),
  );

  /**
   * The anchor the notice hangs on, and the landing place after it is closed.
   *
   * It outlives the notice on purpose: the Value Spread callout points readers
   * here, and a reference to an element that stops existing once the notice is
   * dismissed is a reference to nothing.
   */
  private readonly anchor = viewChild.required<ElementRef<HTMLElement>>('anchor');

  protected toggleDetail(): void {
    this.detailOpen.update((open) => !open);
  }

  /**
   * Closes the notice and catches the focus it was holding.
   *
   * Dismissing removes the button the reader has just pressed, which drops
   * focus to `<body>` and loses their place on a page eight regions long.
   * Focus lands on the anchor instead — the same element the callout's
   * reference points at, so both routes leave the reader in the same spot.
   */
  protected dismiss(): void {
    this.service.dismissGuardrails();
    this.anchor().nativeElement.focus({ preventScroll: true });
  }
}
