/**
 * The two states a panel shows when it has no figures: a placeholder while it
 * computes, and its own message with its own retry when it fails.
 */

import { ComponentFixture, TestBed } from '@angular/core/testing';

import { TurbulenceService } from '../../../../services/turbulence.service';
import { PanelFallback } from './panel-fallback';

describe('PanelFallback', () => {
  let fixture: ComponentFixture<PanelFallback>;
  let host: HTMLElement;
  let service: TurbulenceService;

  beforeEach(async () => {
    await TestBed.configureTestingModule({ imports: [PanelFallback] }).compileComponents();

    fixture = TestBed.createComponent(PanelFallback);
    fixture.componentRef.setInput('panel', 'absorption');
    fixture.componentRef.setInput('height', 'h-72');
    host = fixture.nativeElement;
    service = TestBed.inject(TurbulenceService);
    document.body.appendChild(host);
    fixture.detectChanges();
  });

  afterEach(() => {
    host.remove();
  });

  it('when the panel has no error, it holds the layout open at the height it stands in for', () => {
    const placeholder = host.querySelector('[data-testid="panel-loading-absorption"]');
    expect(placeholder?.getAttribute('aria-busy')).toBe('true');
    expect(host.querySelector('.h-72')).not.toBeNull();
    expect(host.querySelector('[role="status"]')?.textContent).toContain('Absorption ratio');
  });

  it('when the panel has failed, it names the fault rather than saying something went wrong', async () => {
    await service.refreshPanel('absorption', true);
    fixture.detectChanges();

    const error = host.querySelector('[data-testid="panel-error-absorption"]');
    expect(error?.textContent).toContain('The absorption ratio could not be computed.');
    expect(error?.textContent).toContain('500 days of aligned returns');
    // A background computation, announced politely rather than as an alert.
    expect(host.querySelector('app-error-state div')?.getAttribute('role')).toBe('status');
  });

  it('when the retry is pressed, this panel recomputes and its neighbours are left alone', async () => {
    await service.refreshPanel('absorption', true);
    await service.refreshPanel('spectrum', true);
    fixture.detectChanges();

    const retry = host.querySelector('button') as HTMLButtonElement;
    retry.click();
    expect(service.panelStatus().absorption).toBe('loading');
    expect(service.panelStatus().spectrum).toBe('error');

    await new Promise((resolve) => setTimeout(resolve, 800));
    fixture.detectChanges();

    expect(service.panelStatus().absorption).toBe('ready');
    expect(service.panelStatus().spectrum).toBe('error');
    expect(host.querySelector('[data-testid="panel-error-absorption"]')).toBeNull();
  });
});
