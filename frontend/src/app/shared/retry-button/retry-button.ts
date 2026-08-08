import { ChangeDetectionStrategy, Component, input, output } from '@angular/core';

/** Recovery action paired with an `ErrorState`. */
@Component({
  selector: 'app-retry-button',
  templateUrl: './retry-button.html',
  styleUrl: './retry-button.css',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class RetryButton {
  readonly label = input('Retry');
  readonly retry = output<void>();
}
