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
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class Topbar {
  readonly sidebarOpen = input(false);
  readonly toggleSidebar = output<void>();
}
