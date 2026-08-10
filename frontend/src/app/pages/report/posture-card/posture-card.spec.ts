/**
 * The audit-posture card.
 *
 * Four indicators and a provenance line, and every one of them is a claim
 * about what the system does *not* guarantee. Two rules are pinned here: no
 * indicator carries its state in colour alone, and the broker row is derived
 * from the posture rather than written down — a card that hardcoded "Not
 * configured" would keep saying it after somebody registered an adapter.
 */

import { ComponentFixture, TestBed } from '@angular/core/testing';

import { ExecutionService } from '../../../services/execution.service';
import { ReportAuditService } from '../../../services/report-audit.service';
import { PostureCard } from './posture-card';

describe('PostureCard', () => {
  let fixture: ComponentFixture<PostureCard>;
  let host: HTMLElement;
  let service: ReportAuditService;
  let execution: ExecutionService;

  beforeEach(async () => {
    await TestBed.configureTestingModule({ imports: [PostureCard] }).compileComponents();
    fixture = TestBed.createComponent(PostureCard);
    host = fixture.nativeElement;
    service = TestBed.inject(ReportAuditService);
    execution = TestBed.inject(ExecutionService);
    fixture.detectChanges();
  });

  function terms(): string[] {
    return Array.from(host.querySelectorAll('dt')).map((dt) => dt.textContent?.trim() ?? '');
  }

  function definitionFor(label: string): string {
    const index = terms().indexOf(label);
    expect(index).toBeGreaterThanOrEqual(0);
    return Array.from(host.querySelectorAll('dd'))[index].textContent ?? '';
  }

  it('when the card renders, the four posture indicators are a description list', () => {
    expect(host.querySelector('dl')).not.toBeNull();
    expect(terms()).toEqual([
      'Decision logging',
      'Reproducibility',
      'LLM validation',
      'Broker idempotency',
    ]);
  });

  it('when the card renders, each indicator states its status in words', () => {
    expect(definitionFor('Decision logging')).toContain('Active');
    expect(definitionFor('Decision logging')).toContain('model + params + output');
    expect(definitionFor('Reproducibility')).toContain('Not guaranteed');
    expect(definitionFor('Reproducibility')).toContain('Ollama model');
    expect(definitionFor('LLM validation')).toContain('At the LLM port');
    expect(definitionFor('Broker idempotency')).toContain('Not configured');
  });

  it('when the card renders, the glyphs are decorative and never the only signal', () => {
    const glyphs = Array.from(host.querySelectorAll('dd [aria-hidden="true"]'));

    expect(glyphs).toHaveLength(4);
    for (const glyph of glyphs) {
      expect(['●', '○']).toContain(glyph.textContent?.trim());
      // The state beside it is real text, so the row survives greyscale.
      expect(glyph.parentElement?.textContent?.replace(glyph.textContent ?? '', '').trim()).not.toBe(
        '',
      );
    }
  });

  it('when no broker is configured, the provenance line says nothing syncs the positions', () => {
    const line = host.querySelector('[data-testid="positions-source"]');

    expect(line?.textContent).toContain('Positions source');
    expect(line?.textContent).toContain('manual entry or CSV import');
    expect(line?.textContent).toContain('no broker configured to sync');
  });

  it('when an adapter is registered, both the indicator and the provenance line change', () => {
    execution.setBroker({ posture: 'connected', adapter: 'Trading 212', detail: null });
    fixture.detectChanges();

    expect(definitionFor('Broker idempotency')).toContain('Configured');
    expect(definitionFor('Broker idempotency')).toContain('Trading 212');
    expect(host.querySelector('[data-testid="positions-source"]')?.textContent).toContain(
      'never its source',
    );
  });

  it('when the card is being read, placeholders stand in and no indicator is shown', async () => {
    const pending = service.refresh();
    fixture.detectChanges();

    expect(host.querySelector('[data-testid="posture-skeleton"]')?.getAttribute('aria-busy')).toBe(
      'true',
    );
    expect(host.querySelector('dl')).toBeNull();

    await pending;
  });

  it('when the posture cannot be read, the fallback says so with an icon and a word', async () => {
    await service.refresh(true);
    fixture.detectChanges();

    const fallback = host.querySelector('[data-testid="posture-unavailable"]');
    expect(fallback?.textContent).toContain('Status unavailable');
    expect(fallback?.querySelector('[aria-hidden="true"]')?.textContent?.trim()).toBe('!');
    expect(host.querySelector('dl')).toBeNull();
  });
});
