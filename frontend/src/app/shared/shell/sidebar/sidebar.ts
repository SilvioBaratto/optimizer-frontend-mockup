import { ChangeDetectionStrategy, Component, computed, inject, input, output, signal } from '@angular/core';
import { toSignal } from '@angular/core/rxjs-interop';
import { NavigationEnd, Router, RouterLink, RouterLinkActive } from '@angular/router';
import { LucideAngularModule } from 'lucide-angular';
import { filter, map, startWith } from 'rxjs/operators';

import { NAV_SECTIONS, sectionLabelFor } from '../nav-config';

/**
 * The 8-section primary navigation.
 *
 * Fixed from `md` up; below that an off-canvas drawer opened by the topbar
 * hamburger — the responsive behaviour the template specifies at 320px and
 * 768px alike. There is no bottom bar.
 *
 * **Why the sections collapse.** Fully expanded this is 24 rows plus 6 group
 * headings, which overflows the viewport: the last group and Report sit below
 * the fold, and NN/g's finding is that users simply miss items down there.
 * Collapsing brings it to ~13 rows with no scrolling.
 *
 * The cost of an accordion is interaction cost and reduced awareness of what
 * is hidden. Both are bounded here: every group heading stays visible, so
 * nothing is more than one click deep and no section is invisible — and the
 * section holding the current route opens on its own, so arriving somewhere
 * never requires a click to see where you are. Work in this product happens
 * within a section (BUILD, then RESULTS), which is exactly the case NN/g says
 * an accordion suits.
 *
 * Rows carry no icons: the shell drawing in every page spec renders sub-items
 * as bare labels, and words are scanned faster than invented symbols.
 */
@Component({
  selector: 'app-shell-sidebar',
  imports: [RouterLink, RouterLinkActive, LucideAngularModule],
  templateUrl: './sidebar.html',
  styleUrl: './sidebar.css',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class Sidebar {
  private readonly router = inject(Router);

  readonly isOpen = input(false);
  readonly isMobile = input(false);
  readonly navigate = output<void>();

  protected readonly sections = NAV_SECTIONS;

  /** Desktop always shows it; mobile only when the drawer is open. */
  protected readonly visible = computed(() => !this.isMobile() || this.isOpen());

  private readonly url = toSignal(
    this.router.events.pipe(
      filter((e): e is NavigationEnd => e instanceof NavigationEnd),
      map((e) => e.urlAfterRedirects.split('?')[0]),
      startWith(this.router.url.split('?')[0]),
    ),
    { initialValue: '/' },
  );

  /** Group heading of the page currently open, or null on an ungrouped page. */
  protected readonly activeSection = computed(() => sectionLabelFor(this.url()));

  /**
   * Manual open/closed choices, keyed by heading.
   *
   * Only an override: absent means "follow the active section". Kept separate
   * so navigating somewhere new still reveals that section without wiping what
   * the user chose to keep open.
   */
  private readonly overrides = signal<Record<string, boolean>>({});

  protected isExpanded(label: string): boolean {
    return this.overrides()[label] ?? label === this.activeSection();
  }

  protected toggle(label: string): void {
    const next = !this.isExpanded(label);
    this.overrides.update((o) => ({ ...o, [label]: next }));
  }

  /** Lets a collapsed section still show that it holds the current page. */
  protected holdsActivePage(label: string): boolean {
    return label === this.activeSection();
  }

  protected sectionId(label: string): string {
    return `nav-section-${label.toLowerCase().replace(/[^a-z]+/g, '-')}`;
  }
}
