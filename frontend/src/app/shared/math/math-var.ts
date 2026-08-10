import { ChangeDetectionStrategy, Component, computed, input } from '@angular/core';

/** A single identifier, optionally with a subscript and/or a superscript. */
export interface VarPart {
  base: string;
  sub: string;
  sup: string;
}

type Parsed =
  | { kind: 'var'; part: VarPart }
  /** An identifier under an accent: `N̄`, `x̄`, `ρ̂`. */
  | { kind: 'accent'; base: string; accent: string }
  /** Operator applied to arguments: `E[R_P]`, `SD(R_i)`, `Corr(R_i, R_P)`. */
  | { kind: 'fn'; name: string; open: string; close: string; args: VarPart[] };

const COMBINING = /[̀-ͯ]/;
const FN = /^([A-Za-zΑ-Ωα-ω]{1,4})([[(])(.+)([\])])$/;

function parseVar(raw: string): VarPart {
  const under = raw.indexOf('_');
  const caret = raw.indexOf('^');
  if (under >= 0) {
    const rest = raw.slice(under + 1);
    const c = rest.indexOf('^');
    return {
      base: raw.slice(0, under),
      sub: c >= 0 ? rest.slice(0, c) : rest,
      sup: c >= 0 ? rest.slice(c + 1) : '',
    };
  }
  if (caret >= 0) return { base: raw.slice(0, caret), sub: '', sup: raw.slice(caret + 1) };
  return { base: raw, sub: '', sup: '' };
}

/**
 * One mathematical variable or operator application, typeset by the browser.
 *
 * The app names variables constantly — `r_BL`, `σ_P`, `E[R_P]`, `N̄` — in table
 * headers, labels and captions. As plain text they came out upright in Outfit,
 * reading as UI labels rather than mathematics. MathML hands the job to the
 * browser's math font: italic identifiers, upright operators, correct accent
 * placement, metrics that follow the surrounding type.
 *
 * Native MathML, so no library, no JavaScript at runtime, no web font. Every
 * expression here is a static literal, so a LaTeX parser would be paying for
 * flexibility nothing uses.
 *
 * Three shapes, which between them cover every symbol in the app:
 *
 *   expr="r_BL"          identifier, optional _sub and ^sup
 *   expr="N̄"             identifier under a combining accent (macron, circumflex)
 *   expr="Corr(R_i, R_P)" operator applied to comma-separated arguments
 *
 * Anything with a fraction, a radical, a sum or a relation is a full equation
 * and is written as MathML in place — this deliberately does not grow into a
 * general expression parser.
 */
@Component({
  selector: 'app-math-var',
  templateUrl: './math-var.html',
  styleUrl: './math-var.css',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class MathVar {
  /** `r_BL`, `σ_P`, `β_i^P`, `N̄`, `E[R_P]`, `Corr(R_i, R_P)`. */
  readonly expr = input.required<string>();

  /**
   * Spoken form for assistive tech, where the symbols alone would not be read
   * sensibly. Most are self-evident from the prose around them and need none.
   */
  readonly label = input('');

  protected readonly parsed = computed<Parsed>(() => {
    const raw = this.expr().trim();

    const fn = FN.exec(raw);
    if (fn) {
      return {
        kind: 'fn',
        name: fn[1],
        open: fn[2],
        close: fn[4],
        args: fn[3].split(',').map((a) => parseVar(a.trim())),
      };
    }

    const acc = COMBINING.exec(raw);
    if (acc) {
      return {
        kind: 'accent',
        base: raw.replace(COMBINING, ''),
        // Macron renders as an overbar; every other combining mark here is a hat.
        accent: acc[0] === '̄' ? '¯' : '^',
      };
    }

    return { kind: 'var', part: parseVar(raw) };
  });
}
