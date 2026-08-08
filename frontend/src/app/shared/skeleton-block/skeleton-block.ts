import { ChangeDetectionStrategy, Component, input } from '@angular/core';

/**
 * Loading placeholder sized to the content it replaces.
 *
 * Same height as the final content on purpose — every spec asks for no layout
 * shift when the data lands. The shimmer is suppressed under
 * `prefers-reduced-motion` by the global rule in `styles.css`.
 */
@Component({
  selector: 'app-skeleton-block',
  templateUrl: './skeleton-block.html',
  styleUrl: './skeleton-block.css',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class SkeletonBlock {
  /** Tailwind height utility matching the real content. */
  readonly height = input('h-4');
  readonly width = input('w-full');
  /** Number of stacked bars, for list-shaped content. */
  readonly lines = input(1);

  protected readonly range = (n: number) => Array.from({ length: n }, (_, i) => i);
}
