import { Pipe, PipeTransform } from '@angular/core';

@Pipe({
  name: 'compactCurrency',
})
export class CompactCurrencyPipe implements PipeTransform {

  transform(value: unknown, ...args: unknown[]): unknown {
    return null;
  }

}
