import { ChangeDetectionStrategy, Component, computed, input, output } from '@angular/core';
import { LucideAngularModule } from 'lucide-angular';

import { BUTTON_BASE, BUTTON_SIZE, BUTTON_VARIANT } from './button-tokens';
import type { ButtonSize, ButtonVariant } from './button-tokens';

export type { ButtonSize, ButtonVariant };

@Component({
  selector: 'app-button',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [LucideAngularModule],
  host: {
    '[attr.aria-busy]': 'loading() || null',
    '[attr.aria-disabled]': 'disabled() || null',
    '[attr.disabled]': 'disabled() || null',
  },
  template: `
    <button
      [class]="classes()"
      [disabled]="disabled() || loading()"
      [attr.aria-busy]="loading() || null"
      [attr.aria-disabled]="disabled() || null"
      (click)="handleClick()"
    >
      @if (loading()) {
        <lucide-icon name="loader-2" class="animate-spin" aria-hidden="true" />
      }
      <ng-content />
    </button>
  `,
})
export class ButtonComponent {
  readonly variant = input<ButtonVariant>('primary');
  readonly size = input<ButtonSize>('md');
  readonly loading = input(false);
  readonly disabled = input(false);

  readonly clicked = output<void>();

  readonly classes = computed(
    () =>
      `${BUTTON_BASE} cursor-pointer disabled:cursor-not-allowed ` +
      `${BUTTON_VARIANT[this.variant()]} ${BUTTON_SIZE[this.size()]}`,
  );

  handleClick(): void {
    if (this.disabled() || this.loading()) return;
    this.clicked.emit();
  }
}
