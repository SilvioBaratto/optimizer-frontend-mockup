import { ChangeDetectionStrategy, Component, input } from '@angular/core';

/**
 * `Section › Page` trail.
 *
 * Shown only on pages that are not the root of a primary nav entry. The last
 * item is plain text, never a link to where you already are.
 */
@Component({
  selector: 'app-breadcrumb',
  templateUrl: './breadcrumb.html',
  styleUrl: './breadcrumb.css',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class Breadcrumb {
  readonly section = input<string | null>(null);
  readonly page = input.required<string>();
}
