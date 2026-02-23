/** Validate that required fields are present and non-empty */
export function validateRequired(
  body: Record<string, unknown>,
  fields: string[],
): string | null {
  for (const field of fields) {
    const value = body[field];
    if (value === undefined || value === null || value === '') {
      return `Missing required field: ${field}`;
    }
  }
  return null;
}

/** Validate email format */
export function isValidEmail(email: string): boolean {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
}

/** Validate UUID format */
export function isValidUUID(uuid: string): boolean {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(uuid);
}

/** Validate pagination params and return safe values */
export function validatePagination(
  params: { page?: number; page_size?: number; sort_column?: string; sort_direction?: string },
  allowedSortColumns: string[] = ['created_at'],
) {
  let page = Number(params.page) || 1;
  let pageSize = Number(params.page_size) || 10;
  if (page < 1) page = 1;
  if (pageSize < 1) pageSize = 10;
  if (pageSize > 100) pageSize = 100;

  const sortColumn = allowedSortColumns.includes(params.sort_column ?? '')
    ? params.sort_column!
    : 'created_at';
  const sortDirection =
    params.sort_direction === 'ASC' ? 'ASC' : 'DESC';

  return { page, pageSize, sortColumn, sortDirection };
}

/** Sanitize string input (trim + limit length) */
export function sanitizeString(value: string, maxLength = 500): string {
  return value.trim().slice(0, maxLength);
}

/** Validate amount (positive number) */
export function isValidAmount(amount: unknown): boolean {
  return typeof amount === 'number' && amount >= 0 && isFinite(amount);
}
