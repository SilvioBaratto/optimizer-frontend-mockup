import {
  DestroyRef,
  Directive,
  ElementRef,
  afterNextRender,
  computed,
  inject,
  input,
  signal,
  viewChild,
} from '@angular/core';
import type { EChartsCoreOption } from 'echarts/core';

import { ChartPanelComponent } from './chart-panel';

/** Below this container width the chart is treated as a phone-sized figure. */
const NARROW_PX = 520;

/**
 * Inputs and behaviour every chart component shares, so the panel's frame,
 * sizing, loading state, PNG export and responsive measurement are declared
 * once instead of on each of the six wrappers.
 *
 * `@Directive()` with no selector is what makes Angular inherit the signal
 * inputs into the subclasses.
 */
@Directive()
export abstract class ChartBase {
  readonly title = input('');
  readonly subtitle = input('');
  readonly ariaLabel = input('');
  readonly loading = input(false);
  readonly height = input(320);
  /**
   * Escape hatch, merged over the generated option as a last step. For the
   * occasional spec detail a typed input would not be worth modelling — reach
   * for a new input first, and this only when the need really is one-off.
   */
  readonly optionPatch = input<EChartsCoreOption>({});

  protected readonly panel = viewChild(ChartPanelComponent);

  private readonly host = inject(ElementRef<HTMLElement>);
  private readonly destroyRef = inject(DestroyRef);

  /** Container width in px; 0 until the first measurement lands. */
  private readonly width = signal(0);

  /**
   * Phone-sized container. Measured rather than taken from the viewport,
   * because the same chart sits one-up on mobile and two-up on desktop — what
   * matters is the box it actually got, not the window.
   */
  protected readonly narrow = computed(() => {
    const w = this.width();
    return w > 0 && w < NARROW_PX;
  });

  /**
   * A desktop-height chart eats most of a phone screen, so cap it when the
   * container is narrow. Never taller than the caller asked for.
   */
  protected readonly effectiveHeight = computed(() =>
    this.narrow() ? Math.min(this.height(), 240) : this.height(),
  );

  constructor() {
    afterNextRender(() => {
      const observer = new ResizeObserver((entries) => {
        for (const entry of entries) this.width.set(entry.contentRect.width);
      });
      observer.observe(this.host.nativeElement);
      this.destroyRef.onDestroy(() => observer.disconnect());
    });
  }

  /** Delegates to the panel; null until the async chart init resolves. */
  exportPng(): string | null {
    return this.panel()?.exportPng() ?? null;
  }

  /** Applied by each subclass as the final step of building its option. */
  protected patch(option: EChartsCoreOption): EChartsCoreOption {
    return { ...option, ...this.optionPatch() };
  }
}
