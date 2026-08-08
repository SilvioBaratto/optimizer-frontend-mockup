import { ChangeDetectionStrategy, Component, computed, input } from '@angular/core';

export type ListVariant = 'default' | 'divided' | 'striped';

const VARIANT_CLASSES: Record<ListVariant, string> = {
  default: '',
  divided: 'divide-y divide-border',
  striped: '[&>*:nth-child(odd)]:bg-surface-inset',
};

@Component({
  selector: 'ui-list',
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <ul [class]="classes()" role="list">
      <ng-content />
    </ul>
  `,
})
export class ListComponent {
  readonly variant = input<ListVariant>('default');

  readonly classes = computed(() => {
    const base = 'rounded-lg border border-border bg-surface-raised text-text overflow-hidden max-sm:-mx-4 max-sm:rounded-none max-sm:border-x-0';
    return `${base} ${VARIANT_CLASSES[this.variant()]}`.trim();
  });
}
