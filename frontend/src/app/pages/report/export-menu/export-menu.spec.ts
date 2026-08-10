/**
 * The Export action.
 *
 * Two things are worth pinning: the export is over *the filtered set of the
 * active tab* — not the whole log, and not the tab the reader started on — and
 * the menu hands focus back to its trigger on every way out, so a keyboard
 * reader never ends up at the top of the document.
 */

import { ComponentFixture, TestBed } from '@angular/core/testing';

import { ReportAuditService } from '../../../services/report-audit.service';
import { ExportMenu } from './export-menu';

describe('ExportMenu', () => {
  let fixture: ComponentFixture<ExportMenu>;
  let host: HTMLElement;
  let service: ReportAuditService;

  beforeEach(async () => {
    await TestBed.configureTestingModule({ imports: [ExportMenu] }).compileComponents();
    fixture = TestBed.createComponent(ExportMenu);
    host = fixture.nativeElement;
    document.body.appendChild(host);
    service = TestBed.inject(ReportAuditService);
    fixture.detectChanges();
  });

  afterEach(() => host.remove());

  function trigger(): HTMLButtonElement {
    return host.querySelector('[data-testid="export-trigger"]') as HTMLButtonElement;
  }

  function item(format: string): HTMLButtonElement | null {
    return host.querySelector(`[data-export-format="${format}"]`);
  }

  function notice(): string {
    return host.querySelector('[data-testid="export-notice"]')?.textContent?.trim() ?? '';
  }

  it('when the row renders, Export is the only action in it', () => {
    const buttons = Array.from(host.querySelectorAll('app-action-button-row button'));

    expect(buttons).toHaveLength(1);
    expect(buttons[0].textContent).toContain('Export');
  });

  it('when the menu is closed, the trigger says so and no format is reachable', () => {
    expect(trigger().getAttribute('aria-expanded')).toBe('false');
    expect(trigger().getAttribute('aria-haspopup')).toBe('menu');
    expect(item('csv')).toBeNull();
  });

  it('when the trigger is used, both formats are offered as menu items', () => {
    trigger().click();
    fixture.detectChanges();

    expect(trigger().getAttribute('aria-expanded')).toBe('true');
    expect(host.querySelector('[role="menu"]')).not.toBeNull();
    expect(item('csv')?.getAttribute('role')).toBe('menuitem');
    expect(item('pdf')?.getAttribute('role')).toBe('menuitem');
  });

  it('when the menu is open, it names the set the export would carry', () => {
    trigger().click();
    fixture.detectChanges();

    // The scope line is attached with aria-describedby, not nested inside the
    // menu: role="menu" may only own menu items, and a paragraph in there is
    // dropped from the accessibility tree.
    const menu = host.querySelector('[role="menu"]')!;
    const described = host.querySelector(`#${menu.getAttribute('aria-describedby')}`);

    expect(described?.textContent).toContain(`${service.filteredCount()} decisions`);
    expect(described?.textContent).toContain('Decision Log');
    expect(described?.closest('[role="menu"]')).toBeNull();
  });

  it('when the menu is open, every child of the menu is a menu item', () => {
    trigger().click();
    fixture.detectChanges();

    const menu = host.querySelector('[role="menu"]')!;

    expect(menu.children.length).toBeGreaterThan(0);
    for (const child of Array.from(menu.children)) {
      expect(child.getAttribute('role')).toBe('menuitem');
    }
  });

  it('when the log is being re-read, Export refuses without taking the focus off itself', async () => {
    trigger().focus();
    const pending = service.refresh();
    fixture.detectChanges();

    expect(trigger().getAttribute('aria-disabled')).toBe('true');
    expect(trigger().getAttribute('aria-busy')).toBe('true');
    // aria-disabled, never disabled — a disabled element cannot hold focus.
    expect(trigger().hasAttribute('disabled')).toBe(false);
    expect(document.activeElement).toBe(trigger());

    trigger().click();
    fixture.detectChanges();
    expect(host.querySelector('[role="menu"]')).toBeNull();

    await pending;
  });

  it('when a read starts with the menu open, the menu goes rather than name a stale count', async () => {
    trigger().click();
    fixture.detectChanges();
    expect(host.querySelector('[role="menu"]')).not.toBeNull();

    const pending = service.refresh();
    fixture.detectChanges();

    expect(host.querySelector('[role="menu"]')).toBeNull();
    expect(item('csv')).toBeNull();

    await pending;
  });

  it('when the query moves after an export, the receipt does not stay behind to describe it', () => {
    trigger().click();
    fixture.detectChanges();
    item('csv')!.click();
    fixture.detectChanges();
    expect(notice()).toContain(`${service.filteredCount()} decisions`);

    service.setAgentFilter('macro');
    fixture.detectChanges();

    expect(notice()).toBe('');
  });

  it('when the tab moves after an export, the receipt does not follow it', () => {
    trigger().click();
    fixture.detectChanges();
    item('pdf')!.click();
    fixture.detectChanges();
    expect(notice()).toContain('Decision Log');

    service.setTab('positions-provenance');
    fixture.detectChanges();

    expect(notice()).toBe('');
  });

  it('when a format is chosen, the export covers the filtered set of the active tab', () => {
    service.setAgentFilter('risk');
    fixture.detectChanges();
    trigger().click();
    fixture.detectChanges();

    item('csv')!.click();
    fixture.detectChanges();

    expect(notice()).toContain(`${service.filteredCount()} decisions`);
    expect(notice()).toContain('Decision Log');
    expect(notice()).toContain('CSV');
  });

  it('when the tab is not the decision log, the export follows it there', () => {
    service.setTab('positions-provenance');
    fixture.detectChanges();
    trigger().click();
    fixture.detectChanges();

    item('pdf')!.click();
    fixture.detectChanges();

    expect(notice()).toContain(`${service.positionCount()} positions`);
    expect(notice()).toContain('Positions Provenance');
    expect(notice()).toContain('PDF');
  });

  it('when a format is chosen, the menu closes and focus returns to the trigger', () => {
    trigger().focus();
    trigger().click();
    fixture.detectChanges();

    item('csv')!.click();
    fixture.detectChanges();

    expect(host.querySelector('[role="menu"]')).toBeNull();
    expect(document.activeElement).toBe(trigger());
  });

  it('when Escape is pressed, the menu closes and focus returns to the trigger', () => {
    trigger().focus();
    trigger().click();
    fixture.detectChanges();

    host.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
    fixture.detectChanges();

    expect(host.querySelector('[role="menu"]')).toBeNull();
    expect(document.activeElement).toBe(trigger());
  });

  it('when the export runs, the outcome is announced politely and nothing is changed', () => {
    const before = service.decisions();
    trigger().click();
    fixture.detectChanges();
    item('csv')!.click();
    fixture.detectChanges();

    expect(host.querySelector('[data-testid="export-notice"]')?.getAttribute('role')).toBe(
      'status',
    );
    expect(notice()).toContain('The audit log is unchanged.');
    expect(service.decisions()).toBe(before);
  });
});
