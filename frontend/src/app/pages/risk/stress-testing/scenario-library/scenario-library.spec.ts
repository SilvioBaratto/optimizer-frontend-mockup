/**
 * The library, and the two guarantees around it: a row prints the parameters it
 * was run at — including the unit its CEP is in, which need not be the one the
 * toolbar shows — and the destructive action never fires on the first click,
 * with the confirmation opening on Cancel.
 */

import { ComponentFixture, TestBed } from '@angular/core/testing';

import {
  DELETE_SCENARIO_TITLE,
  EMPTY_LIBRARY_MESSAGE,
} from '../../../../models/stress-testing.model';
import { StressTestingService } from '../../../../services/stress-testing.service';
import { ScenarioLibrary } from './scenario-library';

/**
 * jsdom implements `<dialog>` as an element with a reflected `open` attribute
 * and nothing else — `showModal()` and `close()` are absent, so the shared
 * `ConfirmDialog`'s effect throws the moment a spec opens one. The shim
 * supplies exactly those two primitives and focuses nothing, so the focus
 * assertions below are about this component's own code.
 */
function installDialogPolyfill(): void {
  const proto = HTMLDialogElement.prototype;
  if (typeof proto.showModal !== 'function') {
    proto.showModal = function showModal(this: HTMLDialogElement): void {
      this.open = true;
    };
  }
  if (typeof proto.close !== 'function') {
    proto.close = function close(this: HTMLDialogElement): void {
      this.open = false;
    };
  }
}

describe('ScenarioLibrary', () => {
  let fixture: ComponentFixture<ScenarioLibrary>;
  let host: HTMLElement;
  let service: StressTestingService;

  beforeAll(() => {
    installDialogPolyfill();
  });

  beforeEach(async () => {
    await TestBed.configureTestingModule({ imports: [ScenarioLibrary] }).compileComponents();

    fixture = TestBed.createComponent(ScenarioLibrary);
    host = fixture.nativeElement;
    service = TestBed.inject(StressTestingService);
    document.body.appendChild(host);
    fixture.detectChanges();
  });

  afterEach(() => {
    host.remove();
  });

  function rows(): HTMLElement[] {
    return Array.from(host.querySelectorAll('[data-scenario]'));
  }

  function row(id: string): HTMLElement {
    const found = host.querySelector(`[data-scenario="${id}"]`);
    expect(found).not.toBeNull();
    return found as HTMLElement;
  }

  function deleteButton(id: string): HTMLButtonElement {
    return host.querySelector(`[data-delete="${id}"]`) as HTMLButtonElement;
  }

  function loadButton(id: string): HTMLButtonElement {
    return host.querySelector(`[data-load="${id}"]`) as HTMLButtonElement;
  }

  function dialogButton(label: string): HTMLButtonElement {
    const match = Array.from(host.querySelectorAll<HTMLButtonElement>('dialog button')).find(
      (button) => button.textContent?.trim() === label,
    );
    expect(match).toBeTruthy();
    return match!;
  }

  function cells(id: string): string[] {
    return Array.from(row(id).querySelectorAll('th,td')).map(
      (cell) => cell.textContent?.replace(/\s+/g, ' ').trim() ?? '',
    );
  }

  // --- the rows --------------------------------------------------------------

  it('when the library renders, it lists the saved scenarios with the parameters they were run at', () => {
    expect(rows()).toHaveLength(4);
    expect(host.querySelector('[data-testid="library-count"]')?.textContent).toContain(
      '4 scenarios saved',
    );

    // Each row prints the unit its own CEP was computed in, per the review
    // finding this page had to close.
    expect(cells('saved-2').slice(0, 7)).toEqual([
      'WC @k=5.00',
      '▼ Worst case',
      '5.00',
      '5.00',
      '−2.4% RWA',
      '−6.6 pts',
      '2026-07-30',
    ]);
  });

  it('when a reverse row is listed, it reports the outcome it reaches rather than a profit', () => {
    const reverse = cells('saved-4');
    expect(reverse[0]).toBe('Reverse: cap. br.');
    expect(reverse[1]).toContain('Reverse');
    expect(reverse[4]).toBe('breach');
    expect(reverse[5]).toBe('—');
  });

  it('when a scenario type is a category, it is a glyph and a word rather than a colour', () => {
    for (const [id, word] of [
      ['saved-1', 'Manual'],
      ['saved-2', 'Worst case'],
      ['saved-4', 'Reverse'],
    ] as const) {
      expect(cells(id)[1]).toContain(word);
    }
  });

  // --- the filter ------------------------------------------------------------

  it('when the type filter narrows the list, the rest of the library is still counted', () => {
    const filter = host.querySelector('#st-library-filter') as HTMLSelectElement;
    filter.value = 'worst-case';
    filter.dispatchEvent(new Event('change'));
    fixture.detectChanges();

    expect(rows()).toHaveLength(2);
    expect(host.querySelector('[data-testid="library-count"]')?.textContent).toContain(
      '2 of 4 scenarios shown',
    );
  });

  it('when the filter matches nothing, the empty result is explained rather than left blank', () => {
    service.deleteScenario('saved-4');
    const filter = host.querySelector('#st-library-filter') as HTMLSelectElement;
    filter.value = 'reverse';
    filter.dispatchEvent(new Event('change'));
    fixture.detectChanges();

    expect(rows()).toHaveLength(0);
    expect(host.querySelector('[data-testid="library-filtered-out"]')?.textContent).toContain(
      'No reverse scenarios saved',
    );
  });

  // --- load ------------------------------------------------------------------

  it('when a manual row is loaded, its parameters and its pinned factors come back', () => {
    service.setK(9);

    loadButton('saved-1').click();
    fixture.detectChanges();

    expect(service.k()).toBe(5);
    expect(service.mode()).toBe('forward');
    expect(service.factors()[0].fixed).toBe(true);
    expect(service.factors()[0].scenarioValue).toBe(-18);
    expect(service.manualResult()?.stale).toBe(false);
  });

  it('when a reverse row is loaded, the page moves to the mode that owns it', () => {
    loadButton('saved-4').click();
    fixture.detectChanges();

    expect(service.mode()).toBe('reverse');
    expect(service.reverseTargetLevel()).toBe(8);
  });

  // --- delete ----------------------------------------------------------------

  it('when Delete is pressed, nothing is removed until a separate confirmation', async () => {
    deleteButton('saved-2').focus();
    deleteButton('saved-2').click();
    fixture.detectChanges();
    await fixture.whenStable();

    expect(service.library()).toHaveLength(4);
    expect(host.querySelector('dialog')?.hasAttribute('open')).toBe(true);
    expect(host.querySelector('dialog')?.textContent).toContain(DELETE_SCENARIO_TITLE);
    expect(host.querySelector('dialog')?.textContent).toContain('WC @k=5.00');
  });

  it('when the confirmation opens, focus is on Cancel rather than on the destructive action', async () => {
    deleteButton('saved-2').focus();
    deleteButton('saved-2').click();
    fixture.detectChanges();
    await fixture.whenStable();

    expect(document.activeElement).toBe(dialogButton('Cancel'));
    expect(document.activeElement).not.toBe(dialogButton('Delete scenario'));
  });

  it('when the confirmation is cancelled, the row survives and focus goes back to its button', async () => {
    deleteButton('saved-2').focus();
    deleteButton('saved-2').click();
    fixture.detectChanges();
    await fixture.whenStable();

    dialogButton('Cancel').click();
    fixture.detectChanges();
    await fixture.whenStable();

    expect(service.library()).toHaveLength(4);
    expect(host.querySelector('dialog')?.hasAttribute('open')).toBe(false);
    expect(document.activeElement).toBe(deleteButton('saved-2'));
  });

  it('when the confirmation is confirmed, exactly that row goes and focus lands somewhere real', async () => {
    deleteButton('saved-2').focus();
    deleteButton('saved-2').click();
    fixture.detectChanges();
    await fixture.whenStable();

    dialogButton('Delete scenario').click();
    fixture.detectChanges();
    await fixture.whenStable();

    expect(rows()).toHaveLength(3);
    expect(host.querySelector('[data-scenario="saved-2"]')).toBeNull();
    expect(host.querySelector('[data-scenario="saved-3"]')).not.toBeNull();
    expect(document.activeElement).toBe(host.querySelector('#st-library-heading'));
  });

  it('when the last row is deleted, the library says what would put one back', () => {
    for (const id of ['saved-1', 'saved-2', 'saved-3', 'saved-4']) {
      service.deleteScenario(id);
    }
    fixture.detectChanges();

    expect(host.querySelector('table')).toBeNull();
    expect(host.textContent).toContain(EMPTY_LIBRARY_MESSAGE);
    expect(host.textContent).toContain('the k and the impact measure it was run at');
  });
});
