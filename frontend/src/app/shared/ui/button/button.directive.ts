import { Directive, computed, input } from '@angular/core';

import { BUTTON_SIZE, BUTTON_VARIANT, buttonClasses } from './button-tokens';
import type { ButtonSize, ButtonVariant } from './button-tokens';

/**
 * Styles a `<button>` the template already owns.
 *
 * Retrofit for the pages, which wrote their own buttons and repeated the same
 * class string up to forty times. A wrapper component cannot replace those:
 * the buttons carry layout classes (`ml-auto`, `self-start`, `w-full`) that
 * have to stay on the button itself, and `type`, `[disabled]` and `(click)`
 * are already bound at the call site. This keeps every one of those and
 * supplies only the appearance.
 *
 * Extra classes still work — the directive writes to `class` and Angular
 * merges them, so `<button appButton="ghost" class="ml-auto">` keeps both.
 */
@Directive({
  selector: 'button[appButton]',
  host: { '[class]': 'classes()' },
})
export class ButtonDirective {
  /** Named for the selector, so `appButton="ghost"` reads as the variant. */
  readonly appButton = input<ButtonVariant | ''>('');
  readonly size = input<ButtonSize>('sm');

  protected readonly classes = computed(() =>
    buttonClasses(this.appButton() || 'secondary', this.size()),
  );
}

export { BUTTON_SIZE, BUTTON_VARIANT };
export type { ButtonSize, ButtonVariant };
