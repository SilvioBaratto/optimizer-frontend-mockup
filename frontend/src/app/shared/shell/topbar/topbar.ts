import { ChangeDetectionStrategy, Component, input, output } from '@angular/core';
import { LucideAngularModule } from 'lucide-angular';

import { PortfolioScopeSwitcher } from '../portfolio-scope-switcher/portfolio-scope-switcher';

/**
 * Hamburger, brand, portfolio scope switcher, notifications.
 *
 * Two controls from the shell drawing in the page specs are deliberately
 * absent. The `◐` theme toggle: this app ships one light palette, so it would
 * control nothing. The `👤 user` menu: this is a single-user application, so an
 * account switcher implies a concept the product does not have.
 */
@Component({
  selector: 'app-shell-topbar',
  imports: [PortfolioScopeSwitcher, LucideAngularModule],
  templateUrl: './topbar.html',
  styleUrl: './topbar.css',
  // Three things are load-bearing here.
  //
  // `block`, because a custom element is `display: inline` until told
  // otherwise and an inline box cannot be positioned at all — `position`,
  // `top` and `z-index` are all ignored on it. `app-shell-topbar` is a flex
  // item today and so happens to be blockified, but that is a property of the
  // parent, and the host must not depend on what it is dropped into.
  //
  // The sticky lives on the HOST, not on the `<header>` inside it. A sticky
  // box is constrained by its containing block: for the header that is this
  // host, whose box is exactly the header's 56px, so there would be no room to
  // slide and the stickiness would silently do nothing. The host's own
  // containing block is `shell.html`'s `min-h-dvh` column, which is at least a
  // viewport tall and on these pages runs to 6000px. Measured before this: at
  // 390x844 on /risk/risk-attribution, scrolling 1200px took the header to
  // top -1200 and the burger button — the only way to open the drawer below
  // `md` — off-screen entirely.
  //
  // `z-20` sits between two neighbours. Below the mobile backdrop's `z-30`,
  // because the backdrop dims the page while the drawer is open and the topbar
  // is part of the page it dims; strictly below, not equal, since the backdrop
  // and this host are siblings whose paint order would otherwise fall to DOM
  // order, which puts the topbar last and therefore on top. Above the page
  // context bars' `md:z-10`, which scroll up to rest under it.
  host: { class: 'sticky top-0 z-20 block shrink-0' },
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class Topbar {
  readonly sidebarOpen = input(false);
  readonly toggleSidebar = output<void>();
}
