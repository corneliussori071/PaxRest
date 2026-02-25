import { createClient } from '@supabase/supabase-js';

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL ?? 'http://localhost:54321';
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY ?? 'placeholder';

export const supabase = createClient(supabaseUrl, supabaseAnonKey);

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

  // getSession() in v2.49 auto-refreshes expired tokens
  const { data: { session } } = await supabase.auth.getSession();
  if (!session) throw new Error('Not authenticated');

  const url = new URL(`${supabaseUrl}/functions/v1/${fn}/${action}`);
  if (params) {
    Object.entries(params).forEach(([k, v]) => url.searchParams.set(k, v));
  }

  const doFetch = (token: string) => {
    const headers: Record<string, string> = {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${token}`,
      apikey: supabaseAnonKey,
    };
    if (branchId) headers['x-branch-id'] = branchId;

    return fetch(url.toString(), {
      method: body ? (method === 'GET' ? 'POST' : method) : method,
      headers,
      body: body ? JSON.stringify(body) : undefined,
    });
  };

  let res = await doFetch(session.access_token);

  // If 401 (token expired between getSession and fetch), refresh and retry once
  if (res.status === 401) {
    const { data: { session: refreshed } } = await supabase.auth.refreshSession();
    if (!refreshed) {
      await supabase.auth.signOut();
      throw new Error('Session expired — please log in again');
    }
    res = await doFetch(refreshed.access_token);
  }

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
