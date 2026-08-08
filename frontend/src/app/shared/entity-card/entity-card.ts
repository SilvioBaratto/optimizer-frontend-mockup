import { NgTemplateOutlet } from '@angular/common';
import { ChangeDetectionStrategy, Component, input, output } from '@angular/core';
import { RouterLink } from '@angular/router';

/**
 * Compact card for one entity: title, meta line, optional status and action.
 *
 * The a11y contract from the template's inventory is that the whole card is
 * *one* interactive element — never a card containing separately focusable
 * links. So `route` makes the entire surface a single anchor, `selectable`
 * makes it a single button, and only one of the two is ever used.
 */
@Component({
  selector: 'app-entity-card',
  imports: [RouterLink, NgTemplateOutlet],
  templateUrl: './entity-card.html',
  styleUrl: './entity-card.css',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class EntityCard {
  readonly title = input.required<string>();
  /** Secondary line — counts, timestamps, whatever identifies the entity. */
  readonly meta = input('');
  /** Turns the card into a single link. */
  readonly route = input<string | null>(null);
  /** Turns the card into a single button. Ignored when `route` is set. */
  readonly selectable = input(false);
  /** Marks the current item for assistive tech as well as visually. */
  readonly current = input(false);
  readonly selected = output<void>();

  protected readonly base =
    'flex w-full items-center justify-between gap-3 rounded-md border px-4 py-3 text-left transition-colors';

  protected classes(): string {
    return this.current()
      ? `${this.base} border-primary bg-primary-light`
      : `${this.base} border-border bg-surface-raised hover:bg-surface-inset`;
  }
}
