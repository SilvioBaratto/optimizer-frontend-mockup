/**
 * The alert & breach log.
 *
 * The shared panel owns the list; what is checked here is the region's own
 * three jobs — truncating to the wireframe's three entries, handing the whole
 * entry back when one is activated, and expanding the detail of the one that
 * is currently marked on a chart.
 */

import { ComponentFixture, TestBed } from '@angular/core/testing';

import type { LogEntry } from '../../../../models/risk-monitoring.model';
import { RiskMonitoringService } from '../../../../services/risk-monitoring.service';
import { AlertLog } from './alert-log';

describe('AlertLog', () => {
  let fixture: ComponentFixture<AlertLog>;
  let host: HTMLElement;
  let service: RiskMonitoringService;

  beforeEach(async () => {
    await TestBed.configureTestingModule({ imports: [AlertLog] }).compileComponents();

    fixture = TestBed.createComponent(AlertLog);
    host = fixture.nativeElement;
    service = TestBed.inject(RiskMonitoringService);
    document.body.appendChild(host);
    fixture.detectChanges();
  });

  afterEach(() => {
    host.remove();
  });

  function rows(): HTMLButtonElement[] {
    return Array.from(host.querySelectorAll('li button'));
  }

  function toggle(): HTMLButtonElement {
    const match = Array.from(host.querySelectorAll('button')).find((b) =>
      (b.textContent ?? '').includes('alerts'),
    );
    expect(match).toBeTruthy();
    return match as HTMLButtonElement;
  }

  it('when the log renders, it is a named region showing the three most recent alerts', () => {
    expect(host.querySelector('section')?.getAttribute('aria-label')).toBe('Alert & breach log');
    expect(rows()).toHaveLength(3);
    expect(rows()[0].textContent).toContain('2026-07-29 14:02');
    expect(rows()[0].textContent).toContain('AvDD crossed into Warning band (72% of limit)');
  });

  it('when the log renders, a row is a stamp and a sentence — nothing is expanded yet', () => {
    const entry = service.recentAlerts()[0];

    expect(entry.detail).toBeTruthy();
    expect(rows()[0].textContent).toContain(entry.text);
    // The shared panel prints `detail` under every row it is given one for.
    // Printing all six measures, values and thresholds at once would leave the
    // activation the spec asks for with nothing left to reveal.
    expect(rows()[0].textContent).not.toContain(entry.detail);
  });

  it('when an entry quotes a drawdown reading, it is the reading the path has that day', () => {
    const series = service.underwaterSeries();

    for (const entry of service.alertLog()) {
      const quoted = /D\(x,t\) (\d+\.\d)%/.exec(entry.detail ?? '');
      if (!quoted) continue;

      const point = series.find((p) => p.date === entry.at.slice(0, 10));
      expect(point).toBeTruthy();
      expect(point!.drawdown.toFixed(1)).toBe(quoted[1]);
    }
  });

  it('when the log names the MaxDD band, it is stamped where the measure crossed it', () => {
    // M(x) reached 18.4% — 61% of its 30% limit — in the single session of
    // 2025-08-27, so that is the only day its band can have been crossed. A
    // second entry claiming the same crossing later contradicts the first.
    const maxdd = service.alertLog().filter((entry) => entry.text.startsWith('MaxDD'));

    expect(maxdd.map((entry) => entry.at.slice(0, 10))).toEqual(['2025-08-27']);
  });

  it('when the log renders, the entries run newest first', () => {
    const stamps = rows().map((row) => row.textContent?.trim().slice(0, 16) ?? '');
    expect(stamps).toEqual([...stamps].sort().reverse());
  });

  it('when the whole history is asked for, the rest of the entries appear', () => {
    expect(toggle().textContent).toContain('View all alerts');

    toggle().click();
    fixture.detectChanges();

    expect(rows()).toHaveLength(service.alertLog().length);
    expect(toggle().textContent).toContain('Show recent alerts');
  });

  it('when the whole history is showing, it can be collapsed again', () => {
    toggle().click();
    fixture.detectChanges();
    toggle().click();
    fixture.detectChanges();

    expect(rows()).toHaveLength(3);
  });

  it('when an entry is activated, the whole entry is handed back', () => {
    const seen: LogEntry[] = [];
    fixture.componentInstance.entrySelected.subscribe((entry) => seen.push(entry));

    rows()[1].click();
    fixture.detectChanges();

    expect(seen).toHaveLength(1);
    expect(seen[0]).toEqual(service.recentAlerts()[1]);
  });

  it('when no entry is marked, no detail is shown', () => {
    expect(host.querySelector('[data-testid="alert-detail"]')).toBeNull();
  });

  it('when an entry is marked, its measure, value, threshold and stamp are expanded', () => {
    const entry = service.recentAlerts()[0];
    fixture.componentRef.setInput('selected', entry);
    fixture.componentRef.setInput('selectedNote', 'Marked at 2026-07-29 on the chart above.');
    fixture.detectChanges();

    const detail = host.querySelector('[data-testid="alert-detail"]');
    expect(detail?.getAttribute('role')).toBe('status');
    expect(detail?.textContent).toContain(entry.at);
    expect(detail?.textContent).toContain(entry.text);
    expect(detail?.textContent).toContain('limit 10.0% (ν₂C)');
    expect(host.querySelector('[data-testid="alert-anchor"]')?.textContent).toContain(
      'Marked at 2026-07-29 on the chart above.',
    );
  });
});
