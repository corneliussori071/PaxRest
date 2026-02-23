import { createClient } from '@supabase/supabase-js';

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL ?? 'http://localhost:54321';
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY ?? 'placeholder';

export const supabase = createClient(supabaseUrl, supabaseAnonKey);

/** Typed fetch helper for Edge Functions with auth */
export async function api<T>(path: string, init?: RequestInit): Promise<{ data: T | null; error: { message: string } | null }> {
  const fnUrl = `${supabaseUrl}/functions/v1${path}`;
  const { data: { session } } = await supabase.auth.getSession();
  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
    ...(init?.headers as Record<string, string> ?? {}),
  };
  if (session?.access_token) {
    headers['Authorization'] = `Bearer ${session.access_token}`;
  }
  try {
    const res = await fetch(fnUrl, { ...init, headers });
    const json = await res.json();
    if (!res.ok) return { data: null, error: { message: json.error?.message || json.message || 'Request failed' } };
    return { data: json as T, error: null };
  } catch (err: any) {
    return { data: null, error: { message: err.message || 'Network error' } };
  }
}
