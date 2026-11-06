/**
 * Invoice Number Utilities for Cargo Billing System
 *
 * Rule:
 * Take receipt as invoice number, but take the last two or three digits on a random basis.
 * E.g., for receipt "261102051":
 *   - 50% chance: randomize last 2 digits -> "2611020" + "84" -> "261102084"
 *   - 50% chance: randomize last 3 digits -> "261102" + "739" -> "261102739"
 *
 * For pure text or short receipts:
 *   - If trailing digits exist, randomizes the trailing 2 or 3 digits.
 *   - If pure alphabetic text, appends 2 or 3 random digits to preserve the name.
 */

export interface InvoiceNumberOptions {
  numDigits?: 2 | 3;
}

/**
 * Generate an invoice number from a receipt by taking receipt as base with last 2 or 3 digits random.
 */
export function generateInvoiceNumberFromReceipt(
  receipt: string,
  options?: InvoiceNumberOptions
): string {
  const clean = String(receipt || '').trim();
  if (!clean) {
    const fallback = Math.floor(100 + Math.random() * 900);
    return `INV-${fallback}`;
  }

  // Randomly select between 2 or 3 digits unless explicitly specified
  const numDigits: 2 | 3 = options?.numDigits ?? (Math.random() < 0.5 ? 2 : 3);

  // If receipt ends with digits or is purely numeric
  const hasDigitsAtEnd = /\d+$/.test(clean);

  if (hasDigitsAtEnd && clean.length > numDigits) {
    const base = clean.slice(0, -numDigits);
    const originalTail = clean.slice(-numDigits);

    let randomTail = '';
    let guard = 0;
    do {
      if (numDigits === 2) {
        randomTail = Math.floor(Math.random() * 100).toString().padStart(2, '0');
      } else {
        randomTail = Math.floor(Math.random() * 1000).toString().padStart(3, '0');
      }
      guard++;
    } while (randomTail === originalTail && guard < 10);

    return `${base}${randomTail}`;
  }

  // If receipt does not end with digits (e.g. pure letters like "RNFANSH"):
  // Append 2 or 3 random digits so the party/marka name is preserved
  const randomSuffix = numDigits === 2
    ? Math.floor(10 + Math.random() * 90).toString()
    : Math.floor(100 + Math.random() * 900).toString();

  return `${clean}${randomSuffix}`;
}
