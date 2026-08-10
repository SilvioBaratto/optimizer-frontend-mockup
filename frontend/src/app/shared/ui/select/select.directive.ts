import { Directive } from '@angular/core';

/**
 * The control styling for a `<select>` the template already owns.
 *
 * `SelectComponent` next door is the reactive-forms control: it takes an
 * `options` array and implements `ControlValueAccessor`. The pages do not work
 * that way — they render `<option>`s with `@for` and their own `[selected]`
 * and `(change)` logic — so this supplies the appearance and leaves the
 * options, the value and the change handling where they already are.
 *
 * Width is the caller's: these sit in toolbars and cells that cap them with
 * `max-w-48` or stretch them with `flex-1`, so nothing here sets a width.
 */
@Directive({
  selector: 'select[appSelect]',
  host: {
    class:
      'min-h-11 rounded-md border border-border-control bg-surface-raised px-2 text-sm text-text',
  },
})
export class SelectDirective {}
