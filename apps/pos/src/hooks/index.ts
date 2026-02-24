import { useState, useEffect, useCallback, useRef } from 'react';
import { supabase, api } from '@/lib/supabase';
import { useAuth } from '@/contexts/AuthContext';

/* ─── useApi: generic data fetcher ─── */
export function useApi<T>(
  fn: string,
  action: string,
  params?: Record<string, string>,
  deps: any[] = [],
) {
  const { activeBranchId } = useAuth();
  const [data, setData] = useState<T | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const fetch = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const result = await api<T>(fn, action, { params, branchId: activeBranchId ?? undefined });
      setData(result);
    } catch (err: any) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }, [fn, action, activeBranchId, JSON.stringify(params), ...deps]);

  useEffect(() => { fetch(); }, [fetch]);

  return { data, loading, error, refetch: fetch };
}

/* ─── usePaginated: paginated list fetcher ─── */
export function usePaginated<T>(
  fn: string,
  action: string,
  extraParams?: Record<string, string>,
) {
  const { activeBranchId } = useAuth();
  const [page, setPage] = useState(0);
  const [pageSize, setPageSize] = useState(10);
  const [sortBy, setSortBy] = useState('created_at');
  const [sortDir, setSortDir] = useState<'asc' | 'desc'>('desc');
  const [search, setSearch] = useState('');
  const [items, setItems] = useState<T[]>([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);

  const fetch = useCallback(async () => {
    setLoading(true);
    try {
      const params: Record<string, string> = {
        page: String(page + 1),
        page_size: String(pageSize),
        sort_column: sortBy,
        sort_direction: sortDir.toUpperCase(),
        ...(search ? { search } : {}),
        ...extraParams,
      };
      const data = await api<{ items: T[]; total: number }>(fn, action, {
        params,
        branchId: activeBranchId ?? undefined,
      });
      setItems(data.items ?? []);
      setTotal(data.total ?? 0);
    } catch (err) {
      console.error(err);
    } finally {
      setLoading(false);
    }
  }, [fn, action, page, pageSize, sortBy, sortDir, search, activeBranchId, JSON.stringify(extraParams)]);

  useEffect(() => { fetch(); }, [fetch]);

  return {
    items, total, loading, page, pageSize, sortBy, sortDir, search,
    setPage, setPageSize, setSortBy, setSortDir, setSearch,
    refetch: fetch,
    onSortChange: (col: string, dir: 'asc' | 'desc') => { setSortBy(col); setSortDir(dir); },
  };
}

/* ─── useRealtime: subscribe to table changes ─── */
export function useRealtime<T extends Record<string, any>>(
  table: string,
  filter?: { column: string; value: string },
  onEvent?: (payload: { eventType: string; new: T; old: T }) => void,
) {
  const channelRef = useRef<any>(null);

  useEffect(() => {
    const channelName = `realtime_${table}_${filter?.value ?? 'all'}`;
    let config: any = {
      event: '*',
      schema: 'public',
      table,
    };
    if (filter) config.filter = `${filter.column}=eq.${filter.value}`;

    const channel = supabase
      .channel(channelName)
      .on('postgres_changes', config, (payload: any) => {
        onEvent?.({
          eventType: payload.eventType,
          new: payload.new as T,
          old: payload.old as T,
        });
      })
      .subscribe();

    channelRef.current = channel;
    return () => { supabase.removeChannel(channel); };
  }, [table, filter?.column, filter?.value]);

  return channelRef;
}
