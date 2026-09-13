// VAT policy for Melio Bookstore (audit TAX-001).
//
// Listed prices are VAT-INCLUSIVE (giá đã gồm thuế GTGT) — the standard for
// Vietnamese retail. `Product.taxRate` (default 0.08) is therefore a
// *breakdown* rate, never added on top of the payable total:
//
//   total = subtotal - discount + shippingFee   (unchanged)
//   taxAmount = Σ gross_line - gross_line / (1 + rate)   (informational)
//
// taxAmount flows into quote responses (display) and the e-invoice row
// (T-VAN tax line). All math is integer bigint minor units; the per-line
// remainder (< number of lines đồng) is truncated, never rounded up, so the
// breakdown can never exceed the amount actually charged.

/** VAT portion embedded in a tax-inclusive gross amount (minor units). */
export function taxIncludedIn(grossMinor: bigint, rate: number): bigint {
  if (grossMinor <= 0n) return 0n;
  if (!Number.isFinite(rate) || rate <= 0) return 0n;
  // gross - gross/(1+rate), scaled by 1e4 to keep the Decimal(5,4) precision.
  const SCALE = 10_000n;
  const rateScaled = BigInt(Math.round(rate * 10_000));
  const net = (grossMinor * SCALE) / (SCALE + rateScaled);
  return grossMinor - net;
}

/** Sum the embedded VAT over lines carrying their own rate. */
export function sumIncludedTax(
  lines: { grossMinor: bigint; rate: number }[]
): bigint {
  return lines.reduce((s, l) => s + taxIncludedIn(l.grossMinor, l.rate), 0n);
}
