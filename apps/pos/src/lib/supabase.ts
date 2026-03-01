import { createClient } from '@supabase/supabase-js';

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL ?? 'http://localhost:54321';
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY ?? 'placeholder';

export const supabase = createClient(supabaseUrl, supabaseAnonKey);

/**
 * Module-level lock for proactive token refresh.
 * All concurrent api() calls that detect an expired/near-expired token
 * share a single refreshSession() call, preventing refresh-token rotation
 * races (where the first rotated token invalidates all others).
 */
let _sessionLock: Promise<{ data: { session: any } }> | null = null;

/**
 * Returns a valid session, refreshing proactively if the access token
 * has expired or will expire within 60 seconds.
 * Uses a module-level lock so concurrent callers all wait for the same
 * network refresh instead of each racing to rotate the refresh token.
 */
async function getValidSession() {
  const { data: { session } } = await supabase.auth.getSession();
  if (!session) return null;

  const expiresAt = session.expires_at ?? 0;
  const nowSeconds = Math.floor(Date.now() / 1000);

  // Token still valid for more than 60 seconds — use it directly
  if (expiresAt - nowSeconds > 60) return session;

  // Token expired or expiring soon — refresh once, shared across all callers
  if (!_sessionLock) {
    _sessionLock = supabase.auth.refreshSession()
      .finally(() => { _sessionLock = null; });
  }
  const { data: { session: refreshed } } = await _sessionLock;
  return refreshed; // null if the refresh token was also expired
}

/* ─── Edge Function caller ─── */
export async function api<T = any>(
  fn: string,
  action: string,
  options: {
    method?: 'GET' | 'POST' | 'PUT' | 'DELETE';
    body?: any;
    params?: Record<string, string>;
    branchId?: string;
  } = {},
): Promise<T> {
  const { method = 'GET', body, params, branchId } = options;

  // Get a guaranteed-valid session (refreshes proactively if near/past expiry)
  const session = await getValidSession();
  if (!session) {
    await supabase.auth.signOut();
    throw new Error('Session expired — please log in again');
  }

  const url = new URL(`${supabaseUrl}/functions/v1/${fn}/${action}`);
  if (params) {
    Object.entries(params).forEach(([k, v]) => url.searchParams.set(k, v));
  }

  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
    Authorization: `Bearer ${session.access_token}`,
    apikey: supabaseAnonKey,
  };
  if (branchId) headers['x-branch-id'] = branchId;

  const res = await fetch(url.toString(), {
    method: body ? (method === 'GET' ? 'POST' : method) : method,
    headers,
    body: body ? JSON.stringify(body) : undefined,
  });

  const json = await res.json();
  if (!res.ok) {
    const msg = typeof json.error === 'string' ? json.error : json.error?.message ?? `API error ${res.status}`;
    throw new Error(msg);
  }
  return json as T;
}

/* ─── Public (unauthenticated) Edge Function caller ─── */
export async function publicApi<T = any>(
  fn: string,
  action: string,
  options: {
    method?: 'GET' | 'POST' | 'PUT' | 'DELETE';
    body?: any;
    params?: Record<string, string>;
  } = {},
): Promise<T> {
  const { method = 'GET', body, params } = options;

  const url = new URL(`${supabaseUrl}/functions/v1/${fn}/${action}`);
  if (params) {
    Object.entries(params).forEach(([k, v]) => url.searchParams.set(k, v));
  }

  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
    apikey: supabaseAnonKey,
  };

  const res = await fetch(url.toString(), {
    method: body ? 'POST' : method,
    headers,
    body: body ? JSON.stringify(body) : undefined,
  });

  const json = await res.json();
  if (!res.ok) {
    const msg = typeof json.error === 'string' ? json.error : json.error?.message ?? `API error ${res.status}`;
    throw new Error(msg);
  }
  return json as T;
}
