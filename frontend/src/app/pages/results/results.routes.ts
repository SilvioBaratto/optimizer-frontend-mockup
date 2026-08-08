import { Routes } from '@angular/router';

/** RESULTS — reading and validating what a run produced. */
export const RESULTS_ROUTES: Routes = [
  {
    path: 'results-frontier',
    title: 'Results & Frontier',
    loadComponent: () => import('./results-frontier/results-frontier').then((m) => m.ResultsFrontier),
  },
  {
    path: 'backtest-validation',
    title: 'Backtest & Validation',
    loadComponent: () => import('./backtest-validation/backtest-validation').then((m) => m.BacktestValidation),
  },
  {
    path: 'review-rebalancing',
    title: 'Review & Rebalancing',
    loadComponent: () => import('./review-rebalancing/review-rebalancing').then((m) => m.ReviewRebalancing),
  },
];
