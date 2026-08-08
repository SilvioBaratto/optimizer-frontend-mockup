import { Routes } from '@angular/router';

/** APPROVALS — the human gate and the guardrails around it. */
export const APPROVALS_ROUTES: Routes = [
  {
    path: 'approval-gate',
    title: 'Human Approval Gate',
    loadComponent: () => import('./approval-gate/approval-gate').then((m) => m.ApprovalGate),
  },
  {
    path: 'guardrail-killswitch',
    title: 'Guardrail & Kill-Switch',
    loadComponent: () => import('./guardrail-killswitch/guardrail-killswitch').then((m) => m.GuardrailKillswitch),
  },
];
