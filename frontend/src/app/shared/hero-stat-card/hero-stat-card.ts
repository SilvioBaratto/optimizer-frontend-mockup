import { ChangeDetectionStrategy, Component, input } from '@angular/core';

/**
 * The page's headline panel: a titled surface with a prominent action slot.
 *
 * Content is projected rather than modelled as inputs — the specs use this for
 * a weights table on one page and a single metric on another, and enumerating
 * both shapes here would make it two components wearing one name.
 */
@Component({
  selector: 'app-hero-stat-card',
  templateUrl: './hero-stat-card.html',
  styleUrl: './hero-stat-card.css',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class HeroStatCard {
  readonly title = input.required<string>();
  readonly eyebrow = input('');
}
