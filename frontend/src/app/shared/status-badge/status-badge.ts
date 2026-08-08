import { ChangeDetectionStrategy, Component, computed, input } from '@angular/core';

/**
 * Status pill — state, category or severity.
 *
 * The label is always rendered as text. Every page spec repeats the same rule:
 * status is never carried by colour alone, so there is no text-free variant of
 * this component and the glyph is decorative.
 */
export type StatusTone = 'neutral' | 'ok' | 'warn' | 'alert' | 'active' | 'pending';

const TONE_CLASS: Record<StatusTone, string> = {
  neutral: 'bg-surface-inset text-text-secondary border-border',
  ok: 'bg-primary-light text-success border-border',
  warn: 'bg-surface-inset text-warning border-border',
  alert: 'bg-surface-inset text-danger border-border',
  active: 'bg-primary-light text-primary border-primary',
  pending: 'bg-surface-inset text-text-tertiary border-border',
};

/** Decorative — the text beside it is what conveys the state. */
const TONE_GLYPH: Record<StatusTone, string> = {
  neutral: '\u25CF',
  ok: '\u25CF',
  warn: '!',
  alert: '\u2715',
  active: '\u25CF',
  pending: '\u25CB',
};

@Component({
  selector: 'app-status-badge',
  templateUrl: './status-badge.html',
  styleUrl: './status-badge.css',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class StatusBadge {
  readonly label = input.required<string>();
  readonly tone = input<StatusTone>('neutral');

  protected readonly classes = computed(
    () =>
      'inline-flex items-center gap-1.5 rounded-full border px-2 py-0.5 text-xs font-medium ' +
      TONE_CLASS[this.tone()],
  );
  protected readonly glyph = computed(() => TONE_GLYPH[this.tone()]);
}
