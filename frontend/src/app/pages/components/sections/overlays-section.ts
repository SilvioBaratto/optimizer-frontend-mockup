import { ChangeDetectionStrategy, Component, output } from '@angular/core';

import { TooltipComponent } from '../../../shared/ui/tooltip/tooltip';
import { ButtonComponent } from '../../../shared/ui/button/button';
import { StackComponent } from '../../../shared/ui/stack/stack';

/**
 * Overlay trigger buttons only. The overlays themselves use fixed positioning
 * and must render once at the page root — the parent page owns the single
 * overlay instances and the active-overlay state, so this component only
 * previews the buttons that open them.
 */
@Component({
  selector: 'app-overlays-section',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [StackComponent, ButtonComponent, TooltipComponent],
  template: `
    <app-stack direction="row" [gap]="2" align="center">
      <app-button variant="secondary" (clicked)="opened.emit('modal')">Modal</app-button>
      <app-button variant="secondary" (clicked)="opened.emit('slide-over')">Slide-over</app-button>
      <app-button variant="secondary" (clicked)="opened.emit('drawer')">Drawer</app-button>
      <ui-tooltip text="Tooltip text">
        <app-button variant="ghost" size="sm">Hover me</app-button>
      </ui-tooltip>
    </app-stack>
  `,
})
export class OverlaysSectionComponent {
  readonly opened = output<string>();
}
