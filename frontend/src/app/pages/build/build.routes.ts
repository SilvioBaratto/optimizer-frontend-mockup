import { Routes } from '@angular/router';

/** BUILD — constructing an optimization run, in the order the sidebar lists them. */
export const BUILD_ROUTES: Routes = [
  {
    path: 'universe-data',
    title: 'Universe & Data',
    loadComponent: () => import('./universe-data/universe-data.page').then((m) => m.UniverseDataPage),
  },
  {
    path: 'signals-factors',
    title: 'Signals & Factors',
    loadComponent: () => import('./signals-factors/signals-factors.page').then((m) => m.SignalsFactorsPage),
  },
  {
    path: 'views-builder',
    title: 'Views Builder',
    loadComponent: () => import('./views-builder/views-builder.page').then((m) => m.ViewsBuilderPage),
  },
  {
    path: 'objective-constraints',
    title: 'Objective & Constraints',
    loadComponent: () =>
      import('./objective-constraints/objective-constraints.page').then((m) => m.ObjectiveConstraintsPage),
  },
  {
    path: 'run-solver-diagnostics',
    title: 'Run & Solver Diagnostics',
    loadComponent: () =>
      import('./run-solver-diagnostics/run-solver-diagnostics.page').then((m) => m.RunSolverDiagnosticsPage),
  },
];
