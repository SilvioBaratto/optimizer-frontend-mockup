import { ChangeDetectionStrategy, Component, input } from '@angular/core';
import { RouterLink } from '@angular/router';

/**
 * Navigation out of the current page, carrying its context with it.
 *
 * A distinct component rather than a bare anchor because the region lexicon
 * names it: an exit to another page reads differently from an in-page action,
 * and the trailing arrow is part of that signal.
 */
@Component({
  selector: 'app-cross-page-link',
  imports: [RouterLink],
  templateUrl: './cross-page-link.html',
  styleUrl: './cross-page-link.css',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class CrossPageLink {
  readonly label = input.required<string>();
  readonly route = input.required<string>();
  /** Filled reads as the page's primary exit; outline as a secondary one. */
  readonly emphasis = input<'filled' | 'plain'>('plain');
}
