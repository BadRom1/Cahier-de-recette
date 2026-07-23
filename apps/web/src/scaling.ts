/**
 * Utilities to scale ingredient quantities when the number of servings changes.
 *
 * Quantities arrive from the API as display strings (e.g. "250", "1.2", "1/2",
 * "1 1/2"). We parse the numeric ones, apply a scale factor, and re-format them
 * nicely. Non-numeric quantities (e.g. "") are left untouched.
 */

/** Parses a quantity display string into a number, or null if it isn't numeric. */
export function parseQuantity(display: string): number | null {
  const trimmed = display.trim().replace(',', '.');
  if (trimmed === '') return null;

  // "1 1/2" → integer part plus fraction.
  const mixed = /^(\d+)\s+(\d+)\/(\d+)$/.exec(trimmed);
  if (mixed !== null) {
    const whole = Number(mixed[1]);
    const numerator = Number(mixed[2]);
    const denominator = Number(mixed[3]);
    if (denominator === 0) return null;
    return whole + numerator / denominator;
  }

  // "1/2" → simple fraction.
  const fraction = /^(\d+)\/(\d+)$/.exec(trimmed);
  if (fraction !== null) {
    const numerator = Number(fraction[1]);
    const denominator = Number(fraction[2]);
    if (denominator === 0) return null;
    return numerator / denominator;
  }

  // Plain integer or decimal.
  if (/^\d*\.?\d+$/.test(trimmed)) {
    return Number(trimmed);
  }

  return null;
}

/** Formats a scaled quantity back into a compact display string. */
export function formatQuantity(value: number): string {
  // Round to at most two decimals, then drop trailing zeros.
  const rounded = Math.round(value * 100) / 100;
  return Number.isInteger(rounded) ? String(rounded) : String(rounded).replace(/\.?0+$/, '');
}

/**
 * Scales a quantity display string by a factor. Non-numeric quantities are
 * returned unchanged so units-only ingredients (e.g. "une pincée de sel") keep
 * their original wording.
 */
export function scaleQuantity(display: string, factor: number): string {
  const value = parseQuantity(display);
  if (value === null) return display;
  return formatQuantity(value * factor);
}
