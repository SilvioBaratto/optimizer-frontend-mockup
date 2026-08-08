import { Routes } from '@angular/router';

/** ADVANCED SIGNALS — alternative data, regimes and factor rotation. */
export const ADVANCED_SIGNALS_ROUTES: Routes = [
  {
    path: 'alternative-data-sentiment',
    title: 'Alternative Data & Sentiment',
    loadComponent: () =>
      import('./alternative-data-sentiment/alternative-data-sentiment').then((m) => m.AlternativeDataSentiment),
  },
  {
    path: 'market-regimes',
    title: 'Market Regimes',
    loadComponent: () => import('./market-regimes/market-regimes').then((m) => m.MarketRegimes),
  },
  {
    path: 'factor-timing-rotation',
    title: 'Factor Timing & Rotation',
    loadComponent: () =>
      import('./factor-timing-rotation/factor-timing-rotation').then((m) => m.FactorTimingRotation),
  },
];
