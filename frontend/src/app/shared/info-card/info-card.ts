import { ChangeDetectionStrategy, Component, input } from '@angular/core';

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
}
