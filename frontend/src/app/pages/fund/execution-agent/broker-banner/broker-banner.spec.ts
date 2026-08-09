/**
 * The banner is the page's explanation for why nothing here sends an order, so
 * the two things it is checked on are that it is always announced and that it
 * can never be dismissed.
 */

import { ComponentFixture, TestBed } from '@angular/core/testing';

import { ExecutionService } from '../../../../services/execution.service';
import { BrokerBanner } from './broker-banner';

describe('BrokerBanner', () => {
  let fixture: ComponentFixture<BrokerBanner>;
  let service: ExecutionService;

  beforeEach(async () => {
    await TestBed.configureTestingModule({ imports: [BrokerBanner] }).compileComponents();
    fixture = TestBed.createComponent(BrokerBanner);
    service = TestBed.inject(ExecutionService);
  });

  function banner(): HTMLElement {
    fixture.detectChanges();
    return fixture.nativeElement.querySelector('[data-testid="broker-banner"]') as HTMLElement;
  }

  it('when no adapter is configured, the banner is announced politely', () => {
    expect(banner().getAttribute('role')).toBe('status');
  });

  it('when no adapter is configured, the banner says approved orders are placed by hand', () => {
    const text = banner().textContent ?? '';
    expect(text).toContain('No broker configured');
    expect(text).toContain('executed manually');
  });

  it('when no adapter is configured, the banner still vouches for the estimates', () => {
    expect(banner().textContent).toContain('Sizing, scheduling and estimated market impact stay valid');
  });

  it('when the adapter is in error, the banner is announced assertively', () => {
    service.setBroker({
      posture: 'error',
      adapter: 'IBKR',
      detail: 'Session rejected at 09:48 UTC.',
    });
    expect(banner().getAttribute('role')).toBe('alert');
  });

  it('when the adapter is in error, the banner says the approved list is intact', () => {
    service.setBroker({ posture: 'error', adapter: 'IBKR', detail: 'Session rejected.' });
    const text = banner().textContent ?? '';
    expect(text).toContain('Adapter error');
    expect(text).toContain('the approved order list stays intact');
    expect(text).toContain('Session rejected.');
  });

  it('when the adapter is connected, the banner names it and keeps the human gate first', () => {
    service.setBroker({ posture: 'connected', adapter: 'IBKR', detail: null });
    const text = banner().textContent ?? '';
    expect(text).toContain('Broker connected');
    expect(text).toContain('IBKR');
    expect(text).toContain('after the human gate');
  });

  it('whatever the posture, the banner carries no control that could hide it', () => {
    for (const posture of ['not-configured', 'connected', 'error'] as const) {
      service.setBroker({ posture, adapter: posture === 'not-configured' ? null : 'IBKR', detail: null });
      expect(banner().querySelector('button')).toBeNull();
    }
  });
});
