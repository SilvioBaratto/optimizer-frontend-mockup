import { ChangeDetectionStrategy, Component, input, output } from '@angular/core';

import {
  TURBULENCE_SECTIONS,
  TURBULENCE_SECTION_ANCHOR,
  TURBULENCE_SECTION_LABEL,
  type TurbulenceSection,
} from '../../../../models/turbulence.model';

/**
 * Region 4 — the four in-page jumps.
 *
 * Real anchors, not buttons: an `<a href="#…">` is what a jump link is, it
 * carries the target in the status bar, it survives being opened in a new tab
 * and Enter activates it without a keydown handler — which is the spec's
 * "attivabile da tastiera con Invio".
 *
 * The default action is still prevented and the scroll is done by the page. Two
 * reasons: the page owns the anchors and can move focus with the scroll, so a
 * keyboard reader is not left several screens behind what they asked to see;
 * and a bare fragment navigation would push a history entry for what is a
 * reading position, not a page.
 *
 * Nothing here reloads: the sections are already rendered and the jump touches
 * no service signal.
 */
@Component({
  selector: 'app-turbulence-section-nav',
  templateUrl: './section-nav.html',
  host: { class: 'block' },
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class SectionNav {
  /** The section currently in view, when the page tracks one. */
  readonly current = input<TurbulenceSection | null>(null);

  readonly jump = output<TurbulenceSection>();

  protected readonly sections = TURBULENCE_SECTIONS;
  protected readonly label = TURBULENCE_SECTION_LABEL;
  protected readonly anchor = TURBULENCE_SECTION_ANCHOR;

  protected onJump(section: TurbulenceSection, event: Event): void {
    event.preventDefault();
    this.jump.emit(section);
  }
}
