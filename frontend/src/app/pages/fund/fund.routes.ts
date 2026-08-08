import { Routes } from '@angular/router';

/** FUND — the deliberation view and the four agents that feed it. */
export const FUND_ROUTES: Routes = [
  {
    path: 'deliberation',
    title: 'Fund Deliberation',
    loadComponent: () => import('./deliberation/deliberation').then((m) => m.Deliberation),
  },
  {
    path: 'macro-agent',
    title: 'Macro & Regimes Agent',
    loadComponent: () => import('./macro-agent/macro-agent').then((m) => m.MacroAgent),
  },
  {
    path: 'allocation-agent',
    title: 'Allocation Agent',
    loadComponent: () => import('./allocation-agent/allocation-agent').then((m) => m.AllocationAgent),
  },
  {
    path: 'risk-agent',
    title: 'Risk Agent',
    loadComponent: () => import('./risk-agent/risk-agent').then((m) => m.RiskAgent),
  },
  {
    path: 'execution-agent',
    title: 'Execution & Orders Agent',
    loadComponent: () => import('./execution-agent/execution-agent').then((m) => m.ExecutionAgent),
  },
];
