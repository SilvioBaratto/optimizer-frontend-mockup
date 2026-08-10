/**
 * The drawdown threshold table.
 *
 * A table, not a grid of divs: the measures are row headers, the limits are
 * column headers and the caption says what the numbers are. The status is a
 * word beside its colour in every row, the CDaR row follows the α the curve is
 * set to, and nothing in here can change a limit.
 */

import { ComponentFixture, TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';

import type { DrawdownMeasureId } from '../../../../models/risk-monitoring.model';
import { RiskMonitoringService } from '../../../../services/risk-monitoring.service';
import { ThresholdTable } from './threshold-table';

describe('ThresholdTable', () => {
  let fixture: ComponentFixture<ThresholdTable>;
  let host: HTMLElement;
  let service: RiskMonitoringService;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [ThresholdTable],
      providers: [provideRouter([])],
    }).compileComponents();

    fixture = TestBed.createComponent(ThresholdTable);
    host = fixture.nativeElement;
    service = TestBed.inject(RiskMonitoringService);
    document.body.appendChild(host);
    fixture.detectChanges();
  });

  afterEach(() => {
    host.remove();
  });

  function rowFor(measure: DrawdownMeasureId): HTMLTableRowElement {
    const row = host.querySelector(`[data-measure-row="${measure}"]`)?.closest('tr');
    expect(row).toBeTruthy();
    return row as HTMLTableRowElement;
  }

  function cells(measure: DrawdownMeasureId): string[] {
    return Array.from(rowFor(measure).querySelectorAll('th,td')).map((cell) =>
      (cell.textContent ?? '').replace(/\s+/g, ' ').trim(),
    );
  }

  it('when the table renders, it is a table with a caption and scoped headers', () => {
    expect(host.querySelector('caption')?.textContent).toContain('drawdown measures');
    expect(
      Array.from(host.querySelectorAll('thead th')).map((th) => th.getAttribute('scope')),
    ).toEqual(['col', 'col', 'col', 'col', 'col']);
    expect(
      Array.from(host.querySelectorAll('tbody th')).map((th) => th.getAttribute('scope')),
    ).toEqual(['row', 'row', 'row']);
  });

  it('when the table renders, the columns are the ones the wireframe names', () => {
    const headers = Array.from(host.querySelectorAll('thead th')).map((th) =>
      (th.textContent ?? '').replace(/\s+/g, ' ').trim(),
    );
    expect(headers[0]).toBe('Measure');
    expect(headers[1]).toBe('Current');
    expect(headers[2]).toContain('Limit');
    expect(headers[3]).toBe('Utilization');
    expect(headers[4]).toBe('Status');
  });

  it('when the table renders, the three measures are in the order the doc builds them', () => {
    const measures = Array.from(host.querySelectorAll('[data-measure-row]')).map((button) =>
      button.getAttribute('data-measure-row'),
    );
    expect(measures).toEqual(['maxdd', 'avdd', 'cdar']);
  });

  it('when the table renders, each measure is stated against its configured limit', () => {
    expect(cells('maxdd').slice(1, 4)).toEqual(['18.4%', '30.0%', '61% of the limit']);
    expect(cells('avdd').slice(1, 4)).toEqual(['7.2%', '10.0%', '72% of the limit']);
    expect(cells('cdar').slice(1, 4)).toEqual(['9.8%', '14.0%', '70% of the limit']);
  });

  it('when a row is read, its header is the measure, not the measure and its definition', () => {
    // A `th[scope="row"]` is re-announced as the header of every cell in its
    // row: a twenty-word definition inside it is read four times over before
    // the reader reaches a number. It belongs to the table, not to the row.
    expect(cells('maxdd')[0]).toContain('MaxDD');
    expect(cells('maxdd')[0]).not.toContain('The peak of the drawdown function');

    const legend = host.querySelector('[data-testid="measure-legend"]')?.textContent ?? '';
    expect(legend).toContain('The peak of the drawdown function');
    expect(legend).toContain('Δ₀(x) = AvDD and Δ₁(x) = MaxDD');
  });

  it('when a limit is read in money, the capital base it is a fraction of is named', () => {
    service.setDrawdownUnits('abs');
    fixture.detectChanges();

    // "€75.0m" against an unnamed base is a number the reader cannot check.
    expect(cells('maxdd')[2]).toBe('€75.0m');
    expect(host.querySelector('[data-testid="limits-note"]')?.textContent).toContain(
      'C = €250.0m',
    );
  });

  it('when the table renders, every status is a word beside its colour', () => {
    expect(cells('maxdd')[4]).toContain('Warning');
    expect(cells('avdd')[4]).toContain('Warning');
    expect(cells('cdar')[4]).toContain('OK');
    // The band each row is watched from is stated, not left to the colour.
    expect(cells('maxdd')[4]).toContain('warns at 60.0% of the limit');
  });

  it('when a measure passes its limit, the row reads as a breach', () => {
    service.setCdarAlpha(1);
    fixture.detectChanges();

    expect(cells('cdar')[1]).toBe('18.4%');
    expect(cells('cdar')[3]).toBe('131% of the limit');
    expect(cells('cdar')[4]).toContain('Breach');
  });

  it('when α moves, only the CDaR row follows it', () => {
    const maxdd = cells('maxdd');
    const avdd = cells('avdd');

    service.setCdarAlpha(0);
    fixture.detectChanges();

    expect(cells('cdar')[0]).toContain('Δ_0.00(x)');
    expect(cells('cdar')[1]).toBe('7.2%');
    expect(cells('maxdd')).toEqual(maxdd);
    expect(cells('avdd')).toEqual(avdd);
  });

  it('when the units switch to Abs, the readings and the limits restate together', () => {
    service.setDrawdownUnits('abs');
    fixture.detectChanges();

    expect(cells('maxdd').slice(1, 3)).toEqual(['€46.0m', '€75.0m']);
    expect(cells('avdd').slice(1, 3)).toEqual(['€18.0m', '€25.0m']);
    // Utilisation is a ratio on one base and does not move with the units.
    expect(cells('maxdd')[3]).toBe('61% of the limit');
  });

  it('when a row is activated, it asks for its own measure to be shown', () => {
    const seen: DrawdownMeasureId[] = [];
    fixture.componentInstance.measureSelected.subscribe((measure) => seen.push(measure));

    (host.querySelector('[data-measure-row="avdd"]') as HTMLButtonElement).click();
    fixture.detectChanges();

    expect(seen).toEqual(['avdd']);
  });

  it('when a row is the one being shown, it is marked as current', () => {
    fixture.componentRef.setInput('selected', 'cdar');
    fixture.detectChanges();

    expect(rowFor('cdar').getAttribute('aria-current')).toBe('true');
    expect(rowFor('maxdd').getAttribute('aria-current')).toBeNull();
  });

  it('when a row is activated, its control is reachable from the keyboard', () => {
    const control = host.querySelector('[data-measure-row="maxdd"]') as HTMLButtonElement;
    expect(control.tagName).toBe('BUTTON');
    expect(control.textContent).toContain('show on the chart it comes from');
  });

  it('when the table renders, nothing on it can change a limit', () => {
    expect(host.querySelectorAll('input,select,textarea')).toHaveLength(0);
    expect(host.textContent).toContain('Limits are configured in Guardrail & Kill-Switch');
    expect(host.querySelector('a')?.getAttribute('href')).toBe('/approvals/guardrail-killswitch');
  });
});
