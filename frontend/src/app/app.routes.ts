import { Routes } from '@angular/router';

/**
 * One shell hosting one `<router-outlet>`; every page is lazy.
 *
 * Section paths mirror the folders under `pages/`, and each section owns its
 * own routes file so the sidebar's 8 groups and the source tree stay in step.
 *
 * Doc 01 specifies the shell, not a page of its own: its regions live in
 * `shared/shell/` and there is no route for it. `''` lands on the dashboard.
 */
export const routes: Routes = [
  {
    path: '',
    loadComponent: () => import('./shared/shell/shell').then((m) => m.Shell),
    children: [
      { path: '', redirectTo: 'dashboard', pathMatch: 'full' },
      {
        path: 'dashboard',
        title: 'Dashboard',
        loadComponent: () => import('./pages/dashboard/dashboard').then((m) => m.Dashboard),
      },
      {
        path: 'build',
        loadChildren: () => import('./pages/build/build.routes').then((m) => m.BUILD_ROUTES),
      },
      {
        path: 'results',
        loadChildren: () => import('./pages/results/results.routes').then((m) => m.RESULTS_ROUTES),
      },
      {
        path: 'fund',
        loadChildren: () => import('./pages/fund/fund.routes').then((m) => m.FUND_ROUTES),
      },
      {
        path: 'approvals',
        loadChildren: () => import('./pages/approvals/approvals.routes').then((m) => m.APPROVALS_ROUTES),
      },
      {
        path: 'risk',
        loadChildren: () => import('./pages/risk/risk.routes').then((m) => m.RISK_ROUTES),
      },
      {
        path: 'advanced-signals',
        loadChildren: () =>
          import('./pages/advanced-signals/advanced-signals.routes').then((m) => m.ADVANCED_SIGNALS_ROUTES),
      },
      {
        path: 'report',
        title: 'Report',
        loadComponent: () => import('./pages/report/report').then((m) => m.Report),
      },

      // Development galleries — not part of the domain navigation.
      {
        path: 'components',
        title: 'Components',
        loadComponent: () => import('./pages/components/components').then((m) => m.ComponentsComponent),
      },
      {
        path: 'charts-test',
        title: 'Chart components',
        loadComponent: () => import('./pages/charts-test/charts-test').then((m) => m.ChartsTestComponent),
      },
    ],
  },
  { path: '**', redirectTo: '' },
];
