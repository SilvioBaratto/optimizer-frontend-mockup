import {
  ChangeDetectionStrategy,
  Component,
  ContentChildren,
  InjectionToken,
  QueryList,
  Signal,
  computed,
  inject,
  input,
  output,
  signal,
} from '@angular/core';

// ---------------------------------------------------------------------------
// Context token — decouples child components from the parent class reference
// ---------------------------------------------------------------------------

export interface TabsContext {
  readonly activeIndex: Signal<number>;
  readonly tabsId: string;
  activate(index: number): void;
}

export const TABS_CONTEXT = new InjectionToken<TabsContext>('TABS_CONTEXT');

// ---------------------------------------------------------------------------
// Tab button
// ---------------------------------------------------------------------------

@Component({
  selector: 'ui-tab',
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <button
      [id]="ctx.tabsId + '-tab-' + tabIndex()"
      role="tab"
      [attr.aria-selected]="isActive()"
      [attr.aria-controls]="ctx.tabsId + '-panel-' + tabIndex()"
      [attr.tabindex]="isActive() ? 0 : -1"
      class="min-h-11 shrink-0 whitespace-nowrap px-4 py-2 text-sm font-medium transition-colors
             border-b-2 focus-visible:outline-none focus-visible:ring-2
             focus-visible:ring-primary focus-visible:ring-offset-2"
      [class]="tabClasses()"
      (click)="ctx.activate(tabIndex())"
    >
      <ng-content />
    </button>
  `,
})
export class TabComponent {
  protected readonly ctx = inject(TABS_CONTEXT);
  readonly tabIndex = input.required<number>();
  readonly isActive = computed(() => this.ctx.activeIndex() === this.tabIndex());
  readonly tabClasses = computed(() =>
    this.isActive()
      ? 'border-primary text-primary'
      : 'border-transparent text-text-secondary hover:text-text hover:border-border',
  );
}

// ---------------------------------------------------------------------------
// Tab panel
// ---------------------------------------------------------------------------

// Vertical padding only: horizontal padding here stacked on top of the page
// gutter, so a tabbed page sat 16px further in than every untabbed page and its
// edge-to-edge surfaces stopped 16px short of the screen.
@Component({
  selector: 'ui-tab-panel',
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    @if (isActive()) {
      <div
        [id]="ctx.tabsId + '-panel-' + panelIndex()"
        role="tabpanel"
        [attr.aria-labelledby]="ctx.tabsId + '-tab-' + panelIndex()"
        tabindex="0"
        class="py-4 focus-visible:outline-none focus-visible:ring-2
               focus-visible:ring-primary focus-visible:ring-offset-2"
      >
        <ng-content />
      </div>
    }
  `,
})
export class TabPanelComponent {
  protected readonly ctx = inject(TABS_CONTEXT);
  readonly panelIndex = input.required<number>();
  readonly isActive = computed(() => this.ctx.activeIndex() === this.panelIndex());
}

// ---------------------------------------------------------------------------
// Tabs container — provides context; handles roving-tabindex keyboard nav
// ---------------------------------------------------------------------------

let nextTabsId = 0;

@Component({
  selector: 'ui-tabs',
  changeDetection: ChangeDetectionStrategy.OnPush,
  providers: [{ provide: TABS_CONTEXT, useExisting: TabsComponent }],
  host: { '(keydown)': 'onKeydown($event)' },
  template: `
    <!--
      overflow-x-auto plus shrink-0 on the buttons keeps every tab reachable: four
      tabs previously squeezed into a 390px viewport, wrapped to three lines each,
      and the last one was cut off past the right edge with no way to scroll to it.
      The strip bleeds to the screen edges below sm so it reads as a full-width bar
      like the sticky headers on the sibling build pages.
    -->
    <div
      role="tablist"
      class="flex overflow-x-auto scrollbar-hidden border-b border-border bg-surface-raised max-sm:-mx-4"
    >
      <ng-content select="ui-tab" />
    </div>
    <ng-content select="ui-tab-panel" />
  `,
})
export class TabsComponent implements TabsContext {
  readonly activeIndex = signal(0);
  readonly tabsId = `ui-tabs-${nextTabsId++}`;
  readonly tabChanged = output<number>();

  @ContentChildren(TabComponent) private tabItems!: QueryList<TabComponent>;

  activate(index: number): void {
    this.activeIndex.set(index);
    this.tabChanged.emit(index);
  }

  onKeydown(event: KeyboardEvent): void {
    const count = this.tabItems?.length ?? 0;
    if (count === 0) return;
    const cur = this.activeIndex();

    if (event.key === 'ArrowRight') { event.preventDefault(); this.activeIndex.set((cur + 1) % count); }
    else if (event.key === 'ArrowLeft') { event.preventDefault(); this.activeIndex.set((cur - 1 + count) % count); }
    else if (event.key === 'Home') { event.preventDefault(); this.activeIndex.set(0); }
    else if (event.key === 'End') { event.preventDefault(); this.activeIndex.set(count - 1); }
    else if (event.key === 'Enter' || event.key === ' ') { event.preventDefault(); this.tabChanged.emit(cur); }
  }
}
