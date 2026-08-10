/**
 * The candidate models. Two facts the table has to state rather than imply: a
 * model that forecasts nothing has no information coefficient and no weight —
 * an em dash, not a zero — and the weights are a distribution that sums to
 * 100%.
 */

import { ComponentFixture, TestBed } from '@angular/core/testing';

import { AltDataSentimentService } from '../../../../services/alt-data-sentiment.service';
import { AltDataMlModelTable } from './ml-model-table';

describe('AltDataMlModelTable', () => {
  let fixture: ComponentFixture<AltDataMlModelTable>;
  let host: HTMLElement;
  let service: AltDataSentimentService;

  beforeEach(async () => {
    await TestBed.configureTestingModule({ imports: [AltDataMlModelTable] }).compileComponents();

    fixture = TestBed.createComponent(AltDataMlModelTable);
    host = fixture.nativeElement;
    service = TestBed.inject(AltDataSentimentService);
    fixture.detectChanges();
  });

  function cells(id: string): string[] {
    const row = host.querySelector(`[data-model="${id}"]`);
    expect(row).not.toBeNull();
    return Array.from(row?.querySelectorAll('th,td') ?? []).map(
      (cell) => cell.textContent?.replace(/\s+/g, ' ').trim() ?? '',
    );
  }

  it('when the table renders, it lists every candidate with its fit and its weight', () => {
    expect(host.querySelectorAll('[data-model]')).toHaveLength(7);
    expect(cells('nn3')).toEqual([
      'NN3 — show against the aggregate below',
      '0.40%',
      '0.058',
      '28%',
      'best out of sample',
    ]);
  });

  it('when a model fails out of sample, its missing columns read as absent rather than zero', () => {
    const ols = cells('ols');
    expect(ols[1]).toBe('−3.46%');
    expect(ols[2]).toBe('—');
    expect(ols[3]).toBe('0%');
    expect(ols[4]).toContain('over-parameterised');
  });

  it('when the weights are read as a distribution, the footer proves they are one', () => {
    expect(host.querySelector('[data-testid="ads-weight-total"]')?.textContent?.trim()).toBe('100%');
  });

  it('when a row is activated, the table marks it as the current one', () => {
    const button = host.querySelector('[data-model-row="pls"]') as HTMLButtonElement;
    button.click();
    fixture.detectChanges();

    expect(service.selectedModelId()).toBe('pls');
    expect(host.querySelector('[data-model="pls"]')?.getAttribute('aria-current')).toBe('true');
    expect(host.querySelector('[data-model="nn3"]')?.getAttribute('aria-current')).toBeNull();
  });

  it('when the table is read out, the caption says what the R² is measured against', () => {
    const caption = host.querySelector('caption')?.textContent ?? '';
    expect(caption).toContain('measured against zero');
  });
});
