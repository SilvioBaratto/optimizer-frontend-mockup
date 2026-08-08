import { Pipe, PipeTransform } from '@angular/core';

@Pipe({
  name: 'weightPercent',
})
export class WeightPercentPipe implements PipeTransform {

  transform(value: unknown, ...args: unknown[]): unknown {
    return null;
  }

}
