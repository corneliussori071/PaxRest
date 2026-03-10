/** Exchange rates data from the backend */
export interface ExchangeRates {
  baseCurrency: string;
  rates: Record<string, number>;
  lastUpdated: string | null;
  source: string | null;
  fresh: boolean;
}

/** Common currency symbols */
const CURRENCY_SYMBOLS: Record<string, string> = {
  USD: '$', EUR: '€', GBP: '£', JPY: '¥', CNY: '¥',
  NGN: '₦', GHS: '₵', KES: 'KSh', ZAR: 'R', EGP: 'E£',
  INR: '₹', PKR: '₨', BDT: '৳', LKR: '₨', NPR: '₨',
  BRL: 'R$', MXN: '$', ARS: '$', COP: '$', CLP: '$',
  CAD: 'C$', AUD: 'A$', NZD: 'NZ$', SGD: 'S$', HKD: 'HK$',
  CHF: 'CHF', SEK: 'kr', NOK: 'kr', DKK: 'kr', PLN: 'zł',
  CZK: 'Kč', HUF: 'Ft', RON: 'lei', BGN: 'лв', HRK: 'kn',
  TRY: '₺', RUB: '₽', UAH: '₴', ILS: '₪', AED: 'د.إ',
  SAR: '﷼', QAR: 'ر.ق', KWD: 'د.ك', BHD: 'BD', OMR: 'ر.ع.',
  THB: '฿', MYR: 'RM', IDR: 'Rp', PHP: '₱', VND: '₫',
  KRW: '₩', TWD: 'NT$', XOF: 'CFA', XAF: 'FCFA',
};

/**
 * Get the symbol for a currency code.
 * Falls back to the code itself if no symbol is mapped.
 */
export function getCurrencySymbol(currencyCode: string): string {
  return CURRENCY_SYMBOLS[currencyCode?.toUpperCase()] || currencyCode || '$';
}

/**
 * Convert an amount between currencies using exchange rates.
 * Rates must be relative to a base currency.
 *
 * Conversion path: fromCurrency → base → toCurrency
 */
export function convertCurrency(
  amount: number,
  fromCurrency: string,
  toCurrency: string,
  rates: ExchangeRates,
): number {
  if (!amount || !rates?.rates) return amount;

  const from = fromCurrency.toUpperCase();
  const to = toCurrency.toUpperCase();
  if (from === to) return amount;

  const base = rates.baseCurrency.toUpperCase();

  // Convert "from" → base
  let amountInBase: number;
  if (from === base) {
    amountInBase = amount;
  } else {
    const fromRate = rates.rates[from];
    if (!fromRate) return amount; // Can't convert without a rate
    amountInBase = amount / fromRate;
  }

  // Convert base → "to"
  if (to === base) return amountInBase;
  const toRate = rates.rates[to];
  if (!toRate) return amount; // Can't convert without a rate

  return amountInBase * toRate;
}

/**
 * Check if a company needs exchange rates.
 * Returns true if any branch has a different currency than the company base.
 */
export function needsExchangeRates(
  baseCurrency: string,
  branches: Array<{ currency?: string }>,
): boolean {
  const base = (baseCurrency || 'USD').toUpperCase();
  return branches.some(
    (b) => b.currency && b.currency.toUpperCase() !== base,
  );
}
