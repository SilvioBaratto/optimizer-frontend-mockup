import { ChangeDetectionStrategy, Component, Directive, contentChild, input } from '@angular/core';

/**
 * Marks a heading the caller supplies instead of the `title` string.
 *
 * The string input covers almost every card. It cannot cover the ones whose
 * heading contains a subscript — `r_BL`, `x_M`, `V_BL` — because an input is
 * interpolated as text and `<sub>` would be escaped. Those titles come in as
 * projected markup instead, and this carries the heading's styling so the two
 * paths cannot drift apart.
 */
@Directive({
  selector: '[appCardTitle]',
  host: { class: 'text-sm font-medium text-text' },
})
export class CardTitle {}

/**
 * Descriptive or key-value panel.
 *
 * When the body is key-value pairs the caller supplies a `<dl>`; the inventory
 * requires that markup rather than a styled grid of divs, so the pairing is
 * exposed to assistive tech.
 */
@Component({
  selector: 'app-info-card',
  templateUrl: './info-card.html',
  styleUrl: './info-card.css',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class InfoCard {
  readonly title = input('');

  /** Present when the caller projects a heading rather than passing a string. */
  protected readonly projectedTitle = contentChild(CardTitle);
}
