export const SUPPORTED_CURRENCIES = ['USD', 'KHR'] as const;
export type CurrencyCode = (typeof SUPPORTED_CURRENCIES)[number];

export const PAYMENT_METHODS = ['CASH', 'ABA', 'ACLEDA', 'OTHER'] as const;
export type PaymentMethod = (typeof PAYMENT_METHODS)[number];

export const DEFAULT_USD_TO_KHR_RATE = '4100.000000';
export const DEFAULT_TIMEZONE = 'Asia/Phnom_Penh';

const DECIMAL_REGEX = /^-?\d+(?:\.\d+)?$/;

/**
 * Parses a decimal string or number into scaled BigInt integer units without IEEE-754 rounding issues.
 */
export function decimalToScaledInt(value: string | number, scale: number): bigint {
  const raw = typeof value === 'number' ? value.toString() : value.trim();
  if (!DECIMAL_REGEX.test(raw)) {
    throw new Error(`Invalid decimal value: "${value}"`);
  }

  const negative = raw.startsWith('-');
  const unsigned = negative ? raw.slice(1) : raw;
  const [intPart, fracPart = ''] = unsigned.split('.');

  const padded = fracPart.padEnd(scale + 1, '0');
  const kept = padded.slice(0, scale);
  const roundDigit = Number(padded[scale] ?? '0');

  let scaled = BigInt(`${intPart}${kept}`);
  if (roundDigit >= 5) {
    scaled += 1n;
  }

  return negative ? -scaled : scaled;
}

export function scaledIntToDecimal(value: bigint, scale: number): string {
  const negative = value < 0n;
  const abs = negative ? -value : value;
  const str = abs.toString().padStart(scale + 1, '0');
  const intPart = str.slice(0, str.length - scale);
  const fracPart = str.slice(str.length - scale);
  const formatted = scale > 0 ? `${intPart}.${fracPart}` : intPart;
  return negative ? `-${formatted}` : formatted;
}

export function addDecimals(a: string | number, b: string | number, scale = 2): string {
  return scaledIntToDecimal(decimalToScaledInt(a, scale) + decimalToScaledInt(b, scale), scale);
}

export function subDecimals(a: string | number, b: string | number, scale = 2): string {
  return scaledIntToDecimal(decimalToScaledInt(a, scale) - decimalToScaledInt(b, scale), scale);
}

export function mulDecimals(
  a: string | number,
  b: string | number,
  aScale = 4,
  bScale = 2,
  outScale = 2,
): string {
  const intA = decimalToScaledInt(a, aScale);
  const intB = decimalToScaledInt(b, bScale);
  const product = intA * intB;
  const totalScale = aScale + bScale;
  const diff = totalScale - outScale;

  if (diff <= 0) {
    const factor = 10n ** BigInt(-diff);
    return scaledIntToDecimal(product * factor, outScale);
  }

  const divisor = 10n ** BigInt(diff);
  const absProd = product < 0n ? -product : product;
  const quotient = absProd / divisor;
  const remainder = absProd % divisor;
  const roundedAbs = remainder * 2n >= divisor ? quotient + 1n : quotient;
  return scaledIntToDecimal(product < 0n ? -roundedAbs : roundedAbs, outScale);
}

export function compareDecimals(a: string | number, b: string | number, scale = 4): number {
  const intA = decimalToScaledInt(a, scale);
  const intB = decimalToScaledInt(b, scale);
  if (intA < intB) return -1;
  if (intA > intB) return 1;
  return 0;
}

/**
 * Converts monetary values between USD and KHR using exact scaled BigInt arithmetic.
 */
export function convertCurrency(
  amount: string | number,
  from: CurrencyCode,
  to: CurrencyCode,
  usdToKhrRate: string | number = DEFAULT_USD_TO_KHR_RATE,
): string {
  const amountCentsOrUnits = decimalToScaledInt(amount, 2);
  if (from === to) {
    return to === 'KHR'
      ? scaledIntToDecimal(decimalToScaledInt(amount, 0), 0)
      : scaledIntToDecimal(amountCentsOrUnits, 2);
  }

  const rateScaled = decimalToScaledInt(usdToKhrRate, 6);
  if (rateScaled <= 0n) {
    throw new Error('Exchange rate must be greater than zero');
  }

  if (from === 'USD' && to === 'KHR') {
    const product = amountCentsOrUnits * rateScaled;
    const divisor = 100_000_000n;
    const remainder = product % divisor;
    const half = divisor / 2n;
    const rounded = remainder >= half ? product / divisor + 1n : product / divisor;
    return rounded.toString();
  }

  const numerator = amountCentsOrUnits * 1_000_000n;
  const quotient = numerator / rateScaled;
  const remainder = numerator % rateScaled;
  const roundedCents = remainder * 2n >= rateScaled ? quotient + 1n : quotient;
  return scaledIntToDecimal(roundedCents, 2);
}

export function formatCurrency(amount: string | number, currency: CurrencyCode): string {
  if (currency === 'KHR') {
    const whole = Number(decimalToScaledInt(amount, 0));
    return `${new Intl.NumberFormat('en-US', { maximumFractionDigits: 0 }).format(whole)} ៛`;
  }

  const scaled = decimalToScaledInt(amount, 2);
  const negative = scaled < 0n;
  const abs = negative ? -scaled : scaled;
  const str = abs.toString().padStart(3, '0');
  const intPart = str.slice(0, str.length - 2);
  const fracPart = str.slice(str.length - 2);
  const formattedInt = new Intl.NumberFormat('en-US').format(BigInt(intPart));
  return `${negative ? '-' : ''}$${formattedInt}.${fracPart}`;
}
