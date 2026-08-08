/**
 * Standard normal CDF and its inverse.
 *
 * Every discount and deflation on `docs/09 Backtest & Validation.md` is a
 * normal tail probability, and the numbers they produce are the ones a user
 * accepts or rejects a strategy on. A three-term series approximation is not
 * good enough for that: the haircut Sharpe ratio inverts a two-sided p-value
 * that sits far out in the tail, where a cheap `erf` loses the digits being
 * displayed.
 */

/**
 * Φ(z) — Hart's double-precision rational approximation.
 *
 * Accurate to roughly 1e-15 over the whole line, and stable in the far tail
 * where the p-values here live.
 */
export function normalCdf(z: number): number {
  const a = Math.abs(z);
  let c: number;

  if (a > 37) {
    c = 0;
  } else {
    const e = Math.exp((-a * a) / 2);
    if (a < 7.07106781186547) {
      let n = 3.52624965998911e-2 * a + 0.700383064443688;
      n = n * a + 6.37396220353165;
      n = n * a + 33.912866078383;
      n = n * a + 112.079291497871;
      n = n * a + 221.213596169931;
      n = n * a + 220.206867912376;

      let d = 8.83883476483184e-2 * a + 1.75566716318264;
      d = d * a + 16.064177579207;
      d = d * a + 86.7807322029461;
      d = d * a + 296.564248779674;
      d = d * a + 637.333633378831;
      d = d * a + 793.826512519948;
      d = d * a + 440.413735824752;

      c = (e * n) / d;
    } else {
      // Continued fraction, for the far tail.
      let f = a + 0.65;
      f = a + 4 / f;
      f = a + 3 / f;
      f = a + 2 / f;
      f = a + 1 / f;
      c = e / (f * 2.506628274631);
    }
  }

  return z > 0 ? 1 - c : c;
}

/**
 * Φ⁻¹(p) — Acklam's rational approximation, refined once by Halley's method.
 *
 * The refinement is what takes it from ~1e-9 to full double precision, which
 * matters because the haircut inverts probabilities as small as 1e-6.
 */
export function normalQuantile(p: number): number {
  if (p <= 0) return -Infinity;
  if (p >= 1) return Infinity;

  const a = [
    -3.969683028665376e1, 2.209460984245205e2, -2.759285104469687e2, 1.38357751867269e2,
    -3.066479806614716e1, 2.506628277459239,
  ];
  const b = [
    -5.447609879822406e1, 1.615858368580409e2, -1.556989798598866e2, 6.680131188771972e1,
    -1.328068155288572e1,
  ];
  const c = [
    -7.784894002430293e-3, -3.223964580411365e-1, -2.400758277161838, -2.549732539343734,
    4.374664141464968, 2.938163982698783,
  ];
  const d = [7.784695709041462e-3, 3.224671290700398e-1, 2.445134137142996, 3.754408661907416];

  const low = 0.02425;
  let x: number;

  if (p < low) {
    const q = Math.sqrt(-2 * Math.log(p));
    x =
      (((((c[0] * q + c[1]) * q + c[2]) * q + c[3]) * q + c[4]) * q + c[5]) /
      ((((d[0] * q + d[1]) * q + d[2]) * q + d[3]) * q + 1);
  } else if (p <= 1 - low) {
    const q = p - 0.5;
    const r = q * q;
    x =
      ((((((a[0] * r + a[1]) * r + a[2]) * r + a[3]) * r + a[4]) * r + a[5]) * q) /
      (((((b[0] * r + b[1]) * r + b[2]) * r + b[3]) * r + b[4]) * r + 1);
  } else {
    const q = Math.sqrt(-2 * Math.log(1 - p));
    x = -(
      (((((c[0] * q + c[1]) * q + c[2]) * q + c[3]) * q + c[4]) * q + c[5]) /
      ((((d[0] * q + d[1]) * q + d[2]) * q + d[3]) * q + 1)
    );
  }

  const err = normalCdf(x) - p;
  const u = err * Math.sqrt(2 * Math.PI) * Math.exp((x * x) / 2);
  return x - u / (1 + (x * u) / 2);
}

/** Two-sided p-value for a t-statistic, under the normal approximation. */
export function twoSidedP(tStatistic: number): number {
  return 2 * (1 - normalCdf(Math.abs(tStatistic)));
}
