import { ChangeDetectionStrategy, Component, signal } from '@angular/core';

import { CollectionStatBar } from '../../../shared/collection-stat-bar/collection-stat-bar';
import { EventLogPanel, type LogEntry } from '../../../shared/event-log-panel/event-log-panel';
import { FilterChipBar } from '../../../shared/filter-chip-bar/filter-chip-bar';
import { KeyMetricsRow, type KeyMetric } from '../../../shared/key-metrics-row/key-metrics-row';
import {
  SegmentedControl,
  type SegmentedOption,
} from '../../../shared/segmented-control/segmented-control';
import { ButtonDirective } from '../../../shared/ui/button/button.directive';
import { ThemePreviewComponent } from '../theme-preview';

/**
 * The five region components docs 14-25 share.
 *
 * They are page regions rather than UI primitives — each one implements a named
 * region from the page specs (`KeyMetricsRow`, `FilterChipBar`,
 * `CollectionStatBar`, `EventLogPanel`, and the radiogroup the specs draw as a
 * segmented control) — so they sit in their own section rather than among the
 * buttons and inputs.
 */
@Component({
  selector: 'app-region-section',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [
    ThemePreviewComponent,
    KeyMetricsRow,
    SegmentedControl,
    FilterChipBar,
    CollectionStatBar,
    EventLogPanel,
    ButtonDirective,
  ],
  template: `
    <app-theme-preview label="KeyMetricsRow">
      <ng-template>
        <app-key-metrics-row [metrics]="metrics" />
      </ng-template>
    </app-theme-preview>

    <app-theme-preview label="SegmentedControl — a radiogroup with roving tabindex">
      <ng-template>
        <div class="flex flex-wrap gap-6">
          <app-segmented-control
            label="Confidence"
            [options]="confidenceOptions"
            [value]="confidence()"
            (valueChange)="confidence.set($event)"
          />
          <app-segmented-control
            label="Risk measure"
            [options]="measureOptions"
            [value]="measure()"
            (valueChange)="measure.set($event)"
          />
        </div>
      </ng-template>
    </app-theme-preview>

    <app-theme-preview label="FilterChipBar — the count lives in a polite live region">
      <ng-template>
        <app-filter-chip-bar
          searchLabel="Search orders"
          searchPlaceholder="Symbol…"
          [searchValue]="query()"
          (searchChange)="query.set($event)"
          [count]="8"
          [total]="14"
          countNoun="orders"
          summary="3 pending approval · 1 blocked"
        >
          <button type="button" appButton="ghost" size="sm">Stage</button>
          <button type="button" appButton="ghost" size="sm">Side</button>
        </app-filter-chip-bar>
      </ng-template>
    </app-theme-preview>

    <app-theme-preview label="CollectionStatBar">
      <ng-template>
        <app-collection-stat-bar [parts]="statParts" />
      </ng-template>
    </app-theme-preview>

    <app-theme-preview label="EventLogPanel">
      <ng-template>
        <app-event-log-panel
          [entries]="logEntries"
          label="Alert & breach log"
          [(expanded)]="logExpanded"
        >
          <button type="button" appButton="ghost" size="sm">View all alerts</button>
        </app-event-log-panel>
      </ng-template>
    </app-theme-preview>
  `,
})
export class RegionSectionComponent {
  protected readonly metrics: readonly KeyMetric[] = [
    { label: 'VaR (95%, hist., 1D)', value: '3.42%', note: 'of NAV' },
    { label: 'CVaR / ES (95%)', value: '4.87%', note: 'of NAV' },
    {
      label: 'Current drawdown',
      value: '-6.1%',
      note: 'relative',
      badge: { label: 'Warning', tone: 'warn' },
    },
    { label: 'Time underwater', value: '47 days' },
  ];

  protected readonly confidenceOptions: readonly SegmentedOption[] = [
    { value: '90', label: '90%' },
    { value: '95', label: '95%' },
    { value: '99', label: '99%' },
  ];

  protected readonly measureOptions: readonly SegmentedOption[] = [
    { value: 'volatility', label: 'Volatility' },
    { value: 'var', label: 'VaR' },
    {
      value: 'es',
      label: 'ES',
      disabled: true,
      disabledReason: 'Expected shortfall needs a confidence level, which volatility does not use.',
    },
  ];

  protected readonly statParts: readonly string[] = [
    '6 of 14 trades in queue',
    'step Human Gate',
    'sorted by waiting time, longest first',
  ];

  protected readonly logEntries: readonly LogEntry[] = [
    {
      id: 'a1',
      at: '2026-07-29 14:02',
      text: 'AvDD crossed into the Warning band',
      detail: '72% of its configured limit',
    },
    { id: 'a2', at: '2026-06-15 09:11', text: 'Drawdown duration exceeded 30 days' },
    { id: 'a3', at: '2026-05-01 11:47', text: 'CDaR (0.95) returned to the OK band' },
  ];

  protected readonly confidence = signal('95');
  protected readonly measure = signal('volatility');
  protected readonly query = signal('');
  protected readonly logExpanded = signal(true);
}
