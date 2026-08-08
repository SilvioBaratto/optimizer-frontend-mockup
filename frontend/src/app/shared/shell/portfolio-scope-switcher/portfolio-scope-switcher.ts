import { ChangeDetectionStrategy, Component, ElementRef, computed, inject, signal, viewChild } from '@angular/core';

import { FundService } from '../../../services/fund.service';

/**
 * Topbar portfolio selector — the unit of context the user changes most.
 *
 * A combobox, not a menu: the template is explicit about this, because the
 * distinction changes the keyboard contract. It exposes `role="combobox"` with
 * `aria-expanded`/`aria-controls`, the list is `role="listbox"`, and `Esc`
 * returns focus to the trigger.
 *
 * Selection writes to `FundService.active`, which is what keeps this and the
 * page-level portfolio list from drifting apart.
 */
@Component({
  selector: 'app-portfolio-scope-switcher',
  // `min-w-0` lets the topbar shrink this below its content: a flex item
  // defaults to `min-width: auto`, so without it the portfolio name pushes the
  // header wider than a 320px viewport instead of truncating.
  // Escape is handled on the host rather than on the wrapper <div>, which is
  // not focusable and so cannot legitimately carry a key handler itself.
  host: { class: 'flex min-w-0', '(keydown.escape)': 'close()' },
  templateUrl: './portfolio-scope-switcher.html',
  styleUrl: './portfolio-scope-switcher.css',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class PortfolioScopeSwitcher {
  private readonly fund = inject(FundService);

  protected readonly portfolios = this.fund.portfolios;
  protected readonly active = this.fund.active;
  protected readonly open = signal(false);
  protected readonly query = signal('');

  private readonly trigger = viewChild<ElementRef<HTMLButtonElement>>('trigger');

  /** Client-side filter over the already-loaded list — no refetch. */
  protected readonly filtered = computed(() => {
    const q = this.query().trim().toLowerCase();
    const all = this.portfolios();
    return q ? all.filter((p) => p.name.toLowerCase().includes(q)) : all;
  });

  protected toggle(): void {
    this.open.update((v) => !v);
    if (!this.open()) this.query.set('');
  }

  protected select(id: string): void {
    this.fund.setActive(id);
    this.close();
  }

  /** Esc closes and returns focus to the trigger, per the combobox contract. */
  protected close(): void {
    this.open.set(false);
    this.query.set('');
    this.trigger()?.nativeElement.focus();
  }

  protected onQuery(event: Event): void {
    this.query.set((event.target as HTMLInputElement).value);
  }
}
