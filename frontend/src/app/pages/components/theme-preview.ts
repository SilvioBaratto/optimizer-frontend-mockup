import { ChangeDetectionStrategy, Component, TemplateRef, contentChild, input } from '@angular/core';
import { NgTemplateOutlet } from '@angular/common';

/**
 * Renders a projected `<ng-template>` inside a labelled preview surface. The
 * app ships a single light palette (see the @theme block in styles.css), so
 * there is one region per group.
 *
 * Content must be wrapped in an `<ng-template>` rather than projected with a
 * bare `<ng-content />` so the stamping point stays explicit and each group
 * keeps its own instance of the demo content.
 *
 * Overlays (modal, slide-over, drawer) use fixed positioning and escape this
 * container — use OverlayPreviewComponent for those instead.
 */
@Component({
  selector: 'app-theme-preview',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [NgTemplateOutlet],
  template: `
    <div class="space-y-2 mb-6">
      <p class="text-xs font-medium text-text-secondary uppercase tracking-wide">{{ label() }}</p>
      <div class="rounded-lg border border-border bg-surface p-4">
        <ng-container [ngTemplateOutlet]="content()" />
      </div>
    </div>
  `,
})
export class ThemePreviewComponent {
  readonly label = input('');
  readonly content = contentChild.required(TemplateRef);
}
