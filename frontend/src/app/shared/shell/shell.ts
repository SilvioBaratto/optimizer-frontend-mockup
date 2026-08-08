import { ChangeDetectionStrategy, Component, DestroyRef, computed, inject, signal } from '@angular/core';
import { takeUntilDestroyed, toSignal } from '@angular/core/rxjs-interop';
import { NavigationEnd, Router, RouterOutlet } from '@angular/router';
import { Title } from '@angular/platform-browser';
import { filter, map, startWith } from 'rxjs/operators';

import { Breadcrumb } from './breadcrumb/breadcrumb';
import { Sidebar } from './sidebar/sidebar';
import { Topbar } from './topbar/topbar';
import { NAV_LINKS, sectionLabelFor } from './nav-config';

/** Below this the sidebar becomes a drawer. Matches Tailwind's `md`. */
const MOBILE_MAX = 768;

/**
 * The one shell, shared by all 25 pages.
 *
 * Topbar, 8-section sidebar, breadcrumb and portfolio scope switcher live here
 * and nowhere else — no page redraws a piece of the chrome for itself. It hosts
 * a single `<router-outlet>`.
 *
 * The shell also renders the page `<h1>` from the route title. That is why the
 * page specs say "un solo H1 in pagina (il titolo reso dal guscio)": pages
 * start their own headings at `<h2>`.
 */
@Component({
  selector: 'app-shell',
  imports: [RouterOutlet, Topbar, Sidebar, Breadcrumb],
  templateUrl: './shell.html',
  styleUrl: './shell.css',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class Shell {
  private readonly router = inject(Router);
  private readonly title = inject(Title);
  private readonly destroyRef = inject(DestroyRef);

  protected readonly sidebarOpen = signal(false);
  protected readonly isMobile = signal(false);

  /** Current URL, without query or fragment. */
  private readonly url = toSignal(
    this.router.events.pipe(
      filter((e): e is NavigationEnd => e instanceof NavigationEnd),
      map((e) => e.urlAfterRedirects.split('?')[0]),
      startWith(this.router.url.split('?')[0]),
    ),
    { initialValue: '/' },
  );

  protected readonly pageTitle = computed(
    () => NAV_LINKS.find((l) => l.route === this.url())?.label ?? this.title.getTitle(),
  );

  /** Null on a section root, which is where the breadcrumb is suppressed. */
  protected readonly sectionLabel = computed(() => sectionLabelFor(this.url()));

  /** Announced to screen readers on navigation, without moving focus. */
  protected readonly announced = toSignal(
    this.router.events.pipe(
      filter((e): e is NavigationEnd => e instanceof NavigationEnd),
      map(() => this.title.getTitle()),
    ),
    { initialValue: '' },
  );

  private resizeObserver?: ResizeObserver;

  constructor() {
    this.measure();
    this.watchResize();
    this.focusMainOnNavigate();
    this.destroyRef.onDestroy(() => this.resizeObserver?.disconnect());
  }

  protected toggleSidebar(): void {
    this.sidebarOpen.update((v) => !v);
  }

  /** Navigating from the drawer closes it; on desktop there is nothing to close. */
  protected onNavigate(): void {
    if (this.isMobile()) this.sidebarOpen.set(false);
  }

  private measure(): void {
    if (typeof window === 'undefined') return;
    this.isMobile.set(window.innerWidth < MOBILE_MAX);
  }

  private watchResize(): void {
    if (typeof window === 'undefined' || !('ResizeObserver' in window)) return;
    this.resizeObserver = new ResizeObserver((entries) => {
      for (const entry of entries) {
        const mobile = entry.contentRect.width < MOBILE_MAX;
        this.isMobile.set(mobile);
        // Crossing to desktop leaves a stale open drawer behind otherwise.
        if (!mobile) this.sidebarOpen.set(false);
      }
    });
    this.resizeObserver.observe(document.body);
  }

  private focusMainOnNavigate(): void {
    this.router.events
      .pipe(
        filter((e): e is NavigationEnd => e instanceof NavigationEnd),
        takeUntilDestroyed(this.destroyRef),
      )
      .subscribe(() => {
        document.getElementById('main-content')?.focus({ preventScroll: true });
      });
  }
}
