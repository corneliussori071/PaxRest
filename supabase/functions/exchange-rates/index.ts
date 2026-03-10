import { serve } from 'https://deno.land/std@0.208.0/http/server.ts';
import {
  corsResponse, jsonResponse, errorResponse,
  createUserClient, createServiceClient,
  requireAuth,
} from '../_shared/index.ts';
import type { AuthContext } from '../_shared/index.ts';

const CACHE_TTL_MS = 24 * 60 * 60 * 1000; // 24 hours

serve(async (req) => {
  if (req.method === 'OPTIONS') return corsResponse();

  const url = new URL(req.url);
  const segments = url.pathname.split('/').filter(Boolean);
  const action = segments.pop();

  try {
    const supabase = createUserClient(req);
    const authResult = await requireAuth(supabase, req);
    if (authResult instanceof Response) return authResult;
    const auth = authResult as AuthContext;

    switch (action) {
      case 'rates':
        return await getRates(auth);
      default:
        return errorResponse('Unknown exchange-rates action', 404);
    }
  } catch (err) {
    console.error('Exchange-rates error:', err);
    return errorResponse(err.message ?? 'Internal server error', 500);
  }
});

/**
 * GET /exchange-rates/rates
 *
 * Returns cached exchange rates for the user's company.
 * - If rates exist and are fresh (< 24h), returns them.
 * - If rates are stale and user is global (owner/GM), fetches fresh from API.
 * - If rates are stale and user is branch staff, returns stale rates.
 * - If no rates exist and user is global, fetches from API and caches.
 */
async function getRates(auth: AuthContext) {
  if (!auth.companyId) return errorResponse('No company associated', 400);

  const service = createServiceClient();

  // 1. Get the company's base currency
  const { data: company, error: companyErr } = await service
    .from('companies')
    .select('currency')
    .eq('id', auth.companyId)
    .single();

  if (companyErr || !company) return errorResponse('Company not found', 404);
  const baseCurrency = (company.currency || 'USD').toUpperCase();

  // 2. Check for existing cached rates
  const { data: cached } = await service
    .from('exchange_rates')
    .select('*')
    .eq('company_id', auth.companyId)
    .single();

  if (cached) {
    const fetchedAt = new Date(cached.fetched_at).getTime();
    const age = Date.now() - fetchedAt;

    // Fresh — return cached
    if (age < CACHE_TTL_MS) {
      return jsonResponse({
        baseCurrency: cached.base_currency,
        rates: cached.rates,
        lastUpdated: cached.fetched_at,
        source: cached.source,
        fresh: true,
      });
    }

    // Stale — branch user can't refresh, return stale
    if (!auth.isGlobal) {
      return jsonResponse({
        baseCurrency: cached.base_currency,
        rates: cached.rates,
        lastUpdated: cached.fetched_at,
        source: cached.source,
        fresh: false,
      });
    }

    // Stale — global user: fetch fresh rates below
  } else if (!auth.isGlobal) {
    // No cached rates and user is branch staff — nothing to return
    return jsonResponse({
      baseCurrency,
      rates: {},
      lastUpdated: null,
      source: null,
      fresh: false,
    });
  }

  // 3. Global user: fetch from external API
  const apiKey = Deno.env.get('EXCHANGE_RATE_API_KEY');
  if (!apiKey) {
    console.error('EXCHANGE_RATE_API_KEY not set');
    // Return stale if available
    if (cached) {
      return jsonResponse({
        baseCurrency: cached.base_currency,
        rates: cached.rates,
        lastUpdated: cached.fetched_at,
        source: cached.source,
        fresh: false,
      });
    }
    return errorResponse('Exchange rate service not configured', 500);
  }

  try {
    const apiUrl = `https://v6.exchangerate-api.com/v6/${encodeURIComponent(apiKey)}/latest/${encodeURIComponent(baseCurrency)}`;
    const apiRes = await fetch(apiUrl);

    if (!apiRes.ok) {
      throw new Error(`Exchange rate API returned ${apiRes.status}`);
    }

    const apiData = await apiRes.json();

    if (apiData.result !== 'success' || !apiData.conversion_rates) {
      throw new Error(apiData['error-type'] || 'Invalid API response');
    }

    const rates: Record<string, number> = apiData.conversion_rates;
    const now = new Date().toISOString();

    // 4. Upsert into exchange_rates table
    const { error: upsertErr } = await service
      .from('exchange_rates')
      .upsert(
        {
          company_id: auth.companyId,
          base_currency: baseCurrency,
          rates,
          source: 'api',
          fetched_at: now,
          updated_at: now,
        },
        { onConflict: 'company_id' },
      );

    if (upsertErr) {
      console.error('Failed to cache exchange rates:', upsertErr);
    }

    return jsonResponse({
      baseCurrency,
      rates,
      lastUpdated: now,
      source: 'api',
      fresh: true,
    });
  } catch (err) {
    console.error('Failed to fetch exchange rates from API:', err);

    // Return stale rates if available
    if (cached) {
      return jsonResponse({
        baseCurrency: cached.base_currency,
        rates: cached.rates,
        lastUpdated: cached.fetched_at,
        source: cached.source,
        fresh: false,
      });
    }

    return errorResponse('Failed to fetch exchange rates', 502);
  }
}
