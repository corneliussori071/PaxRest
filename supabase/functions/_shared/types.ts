/** Shared types used across Edge Functions (Deno-compatible) */

export interface PaginationParams {
  page?: number;
  page_size?: number;
  sort_column?: string;
  sort_direction?: 'ASC' | 'DESC';
}

export interface PaginatedResponse<T> {
  items: T[];
  total: number;
  page: number;
  page_size: number;
  total_pages: number;
}

export interface ApiResponse<T = unknown> {
  data?: T;
  error?: { message: string; code: string };
}

/** Build a paginated Supabase query */
export function applyPagination<T>(
  query: any,
  page: number,
  pageSize: number,
  sortColumn: string,
  ascending: boolean,
) {
  const from = (page - 1) * pageSize;
  const to = from + pageSize - 1;
  return query.order(sortColumn, { ascending }).range(from, to);
}
