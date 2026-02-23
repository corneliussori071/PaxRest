import { createClient } from '@supabase/supabase-js';

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL ?? 'http://localhost:54321';
const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ?? 'placeholder';

export const supabase = createClient(supabaseUrl, supabaseAnonKey);

export async function publicApi<T = any>(
  path: string,
  init?: RequestInit,
): Promise<{ data: T | null; error: { message: string } | null }> {
  const fnUrl = `${supabaseUrl}/functions/v1${path}`;

  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
    ...(init?.headers as Record<string, string> ?? {}),
    apikey: supabaseAnonKey,
  };

  // Add auth if available
  const { data: { session } } = await supabase.auth.getSession();
  if (session) headers.Authorization = `Bearer ${session.access_token}`;

  try {
    const res = await fetch(fnUrl, { ...init, headers });
    const json = await res.json();
    if (!res.ok) return { data: null, error: { message: json.error?.message || json.message || 'Request failed' } };
    return { data: json as T, error: null };
  } catch (err: any) {
    return { data: null, error: { message: err.message || 'Network error' } };
  }
}
