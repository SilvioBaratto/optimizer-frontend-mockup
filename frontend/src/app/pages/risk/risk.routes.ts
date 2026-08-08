import { Routes } from '@angular/router';

/** RISK — monitoring, attribution and the stress/systemic views. */
export const RISK_ROUTES: Routes = [
  {
    path: 'risk-monitoring',
    title: 'Risk Monitoring',
    loadComponent: () => import('./risk-monitoring/risk-monitoring').then((m) => m.RiskMonitoring),
  },
  {
    path: 'risk-attribution',
    title: 'Risk Attribution',
    loadComponent: () => import('./risk-attribution/risk-attribution').then((m) => m.RiskAttribution),
  },
  {
    path: 'stress-testing',
    title: 'Stress Testing & Scenarios',
    loadComponent: () => import('./stress-testing/stress-testing').then((m) => m.StressTesting),
  },
  {
    path: 'turbulence-systemic',
    title: 'Turbulence & Systemic Risk',
    loadComponent: () => import('./turbulence-systemic/turbulence-systemic').then((m) => m.TurbulenceSystemic),
  },
];
