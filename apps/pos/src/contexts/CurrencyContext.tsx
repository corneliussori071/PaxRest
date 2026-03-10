/**
 * Currency Context
 * Provides currency information and conversion functions throughout the app.
 *
 * - Branch staff: see branch currency, no conversion
 * - Global staff (owner/GM): see base currency, amounts auto-converted
 * - Exchange rates fetched server-side with 24hr caching
 * - localStorage used for instant display while server refreshes
 */

import { createContext, useContext, useEffect, useState, useCallback, type ReactNode } from 'react';
import { useAuth } from './AuthContext';
import { api } from '@/lib/supabase';
import {
  getCurrencySymbol,
  convertCurrency,
  needsExchangeRates,
  formatCurrency,
  type ExchangeRates,
} from '@paxrest/shared-utils';

const LOCAL_CACHE_KEY = 'paxrest_exchange_rates';

interface CurrencyContextType {
  /** Currency symbol to display (e.g. '$', '₦') */
  currencySymbol: string;
  /** Currency code to display (e.g. 'USD', 'NGN') */
  currencyCode: string;
  /** Active branch currency code */
  branchCurrencyCode: string;
  /** Company base currency code */
  baseCurrencyCode: string;
  /** Whether current user is global (owner/GM) */
  isGlobalUser: boolean;
  /** Whether exchange rates are loaded and needed */
  hasExchangeRates: boolean;
  /** Whether rates are currently loading */
  ratesLoading: boolean;
  /** Current exchange rates (null if not needed or not loaded) */
  exchangeRates: ExchangeRates | null;
  /**
   * Quick formatter: assumes amount is in the active branch's currency.
   * Global users: auto-converts to base currency then formats.
   * Branch users: formats in branch currency.
   */
  fmt: (amount: number) => string;
  /**
   * Convert an amount to the display currency.
   * Defaults fromCurrency to the active branch currency.
   */
  convertAmount: (amount: number, fromCurrency?: string) => number;
  /**
   * Format an amount with conversion.
   * Defaults fromCurrency to the active branch currency.
   */
  formatAmount: (amount: number, fromCurrency?: string) => string;
  /**
   * Get the currency symbol for a specific branch.
   */
  getBranchCurrencySymbol: (branchId?: string) => string;
  /** Refresh exchange rates (global users only) */
  refreshRates: () => Promise<void>;
}

const CurrencyContext = createContext<CurrencyContextType | null>(null);

export function CurrencyProvider({ children }: { children: ReactNode }) {
  const { isGlobalStaff, company, branches, activeBranch } = useAuth();

  const [exchangeRates, setExchangeRates] = useState<ExchangeRates | null>(null);
  const [ratesLoading, setRatesLoading] = useState(false);

  // Determine currencies
  const baseCurrencyCode = (company?.currency || 'USD').toUpperCase();
  const branchCurrencyCode = (activeBranch?.currency || baseCurrencyCode).toUpperCase();
  const currencyCode = isGlobalStaff ? baseCurrencyCode : branchCurrencyCode;
  const currencySymbol = getCurrencySymbol(currencyCode);

  // Do we even need exchange rates?
  const needsRates = company ? needsExchangeRates(baseCurrencyCode, branches) : false;
  const hasExchangeRates = exchangeRates !== null && needsRates;

  // Load cached rates from localStorage instantly
  const loadLocalCache = useCallback((): ExchangeRates | null => {
    try {
      const raw = localStorage.getItem(LOCAL_CACHE_KEY);
      if (!raw) return null;
      return JSON.parse(raw) as ExchangeRates;
    } catch {
      return null;
    }
  }, []);

  const saveLocalCache = useCallback((rates: ExchangeRates) => {
    try {
      localStorage.setItem(LOCAL_CACHE_KEY, JSON.stringify(rates));
    } catch {
      // localStorage full or unavailable — ignore
    }
  }, []);

  // Fetch rates from edge function
  const fetchRates = useCallback(async () => {
    try {
      setRatesLoading(true);

      // Show cached rates immediately while fetching
      const cached = loadLocalCache();
      if (cached) setExchangeRates(cached);

      const data = await api<ExchangeRates>('exchange-rates', 'rates');

      if (data && data.rates && Object.keys(data.rates).length > 0) {
        setExchangeRates(data);
        saveLocalCache(data);
      }
    } catch (err) {
      console.error('Failed to load exchange rates:', err);
      // Keep any cached rates we already set
    } finally {
      setRatesLoading(false);
    }
  }, [loadLocalCache, saveLocalCache]);

  // Load rates when company/branches change and rates are needed
  useEffect(() => {
    if (!needsRates) {
      setExchangeRates(null);
      return;
    }
    fetchRates();
  }, [needsRates, baseCurrencyCode]);

  // Convert amount — defaults fromCurrency to the active branch currency
  const convertAmount = useCallback(
    (amount: number, fromCurrency?: string): number => {
      const from = (fromCurrency || branchCurrencyCode).toUpperCase();
      if (from === currencyCode) return amount;
      if (!isGlobalStaff) return amount;
      if (!exchangeRates) return amount;

      return convertCurrency(amount, from, baseCurrencyCode, exchangeRates);
    },
    [currencyCode, isGlobalStaff, exchangeRates, baseCurrencyCode, branchCurrencyCode],
  );

  // Format amount with correct currency — defaults fromCurrency to branch currency
  const formatAmount = useCallback(
    (amount: number, fromCurrency?: string): string => {
      const converted = convertAmount(amount, fromCurrency);
      return formatCurrency(converted, currencyCode);
    },
    [convertAmount, currencyCode],
  );

  // Quick formatter: assumes amount is in active branch currency, auto-converts for global users
  const fmt = useCallback(
    (amount: number): string => {
      if (isGlobalStaff && exchangeRates && branchCurrencyCode !== baseCurrencyCode) {
        const converted = convertCurrency(amount, branchCurrencyCode, baseCurrencyCode, exchangeRates);
        return formatCurrency(converted, baseCurrencyCode);
      }
      return formatCurrency(amount, currencyCode);
    },
    [isGlobalStaff, exchangeRates, branchCurrencyCode, baseCurrencyCode, currencyCode],
  );

  // Get branch-specific currency symbol
  const getBranchCurrencySymbol = useCallback(
    (branchId?: string): string => {
      if (!branchId) return currencySymbol;
      const branch = branches.find((b) => b.id === branchId);
      return getCurrencySymbol(branch?.currency || baseCurrencyCode);
    },
    [branches, currencySymbol, baseCurrencyCode],
  );

  // Manual refresh (global users only)
  const refreshRates = useCallback(async () => {
    if (!isGlobalStaff || !needsRates) return;
    await fetchRates();
  }, [isGlobalStaff, needsRates, fetchRates]);

  return (
    <CurrencyContext.Provider
      value={{
        currencySymbol,
        currencyCode,
        branchCurrencyCode,
        baseCurrencyCode,
        isGlobalUser: isGlobalStaff,
        hasExchangeRates,
        ratesLoading,
        exchangeRates,
        fmt,
        convertAmount,
        formatAmount,
        getBranchCurrencySymbol,
        refreshRates,
      }}
    >
      {children}
    </CurrencyContext.Provider>
  );
}

export function useCurrency() {
  const context = useContext(CurrencyContext);
  if (!context) {
    throw new Error('useCurrency must be used within a CurrencyProvider');
  }
  return context;
}
