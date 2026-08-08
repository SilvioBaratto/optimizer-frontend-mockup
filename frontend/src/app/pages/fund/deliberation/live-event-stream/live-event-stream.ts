import {
  ChangeDetectionStrategy,
  Component,
  ElementRef,
  computed,
  effect,
  inject,
  viewChild,
} from '@angular/core';

import { StatusBadge } from '../../../../shared/status-badge/status-badge';
import { AGENT_LABEL } from '../../../../models/fund-state.model';
import { DeliberationService } from '../../../../services/deliberation.service';

/** Rows held in view; the buffer behind them keeps growing. */
const VISIBLE_ROWS = 12;

/**
 * The per-node SSE stream (Fondamenti §5).
 *
 * Append-only, newest first. Pausing the scroll does not pause the stream: the
 * events keep arriving and the count keeps climbing, which is the distinction
 * the control is actually offering.
 */
@Component({
  selector: 'app-live-event-stream',
  imports: [StatusBadge],
  templateUrl: './live-event-stream.html',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class LiveEventStream {
  private readonly service = inject(DeliberationService);

  protected readonly agentLabel = AGENT_LABEL;
  protected readonly connection = this.service.connection;
  protected readonly lastEventId = this.service.lastEventId;
  protected readonly pauseAutoScroll = this.service.pauseAutoScroll;
  protected readonly hasRun = this.service.hasRun;

  private readonly list = viewChild<ElementRef<HTMLElement>>('list');

  protected readonly visible = computed(() => this.service.visibleEvents().slice(0, VISIBLE_ROWS));

  protected readonly hiddenCount = computed(() =>
    Math.max(0, this.service.visibleEvents().length - VISIBLE_ROWS),
  );

  protected readonly filtered = computed(() => this.service.nodeFilter() !== 'all');

  constructor() {
    // Newest first, so following the stream means staying at the top.
    effect(() => {
      this.visible();
      if (this.pauseAutoScroll()) return;
      const el = this.list()?.nativeElement;
      if (el) el.scrollTop = 0;
    });
  }

  protected onPause(event: Event): void {
    this.pauseAutoScroll.set((event.target as HTMLInputElement).checked);
  }
}
