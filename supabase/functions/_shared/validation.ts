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

/** Max file sizes in bytes */
const MAX_IMAGE_SIZE = 5 * 1024 * 1024; // 5 MB
const MAX_VIDEO_SIZE = 50 * 1024 * 1024; // 50 MB
const MAX_CSV_SIZE = 2 * 1024 * 1024; // 2 MB

const ALLOWED_IMAGE_TYPES = ['image/jpeg', 'image/png', 'image/webp', 'image/gif'];
const ALLOWED_VIDEO_TYPES = ['video/mp4', 'video/webm'];
const ALLOWED_CSV_TYPES = ['text/csv', 'application/vnd.ms-excel'];

/** Validate uploaded file size and type for media */
export function validateMediaFile(
  contentType: string,
  contentLength: number,
): string | null {
  const isImage = ALLOWED_IMAGE_TYPES.includes(contentType);
  const isVideo = ALLOWED_VIDEO_TYPES.includes(contentType);

  if (!isImage && !isVideo) {
    return `Invalid file type: ${contentType}. Allowed: ${[...ALLOWED_IMAGE_TYPES, ...ALLOWED_VIDEO_TYPES].join(', ')}`;
  }
  if (isImage && contentLength > MAX_IMAGE_SIZE) {
    return `Image too large (${(contentLength / 1024 / 1024).toFixed(1)}MB). Max: 5MB`;
  }
  if (isVideo && contentLength > MAX_VIDEO_SIZE) {
    return `Video too large (${(contentLength / 1024 / 1024).toFixed(1)}MB). Max: 50MB`;
  }
  return null;
}

/** Validate uploaded CSV file */
export function validateCSVFile(
  contentType: string,
  contentLength: number,
): string | null {
  if (!ALLOWED_CSV_TYPES.includes(contentType)) {
    return `Invalid file type: ${contentType}. Expected CSV.`;
  }
  if (contentLength > MAX_CSV_SIZE) {
    return `CSV too large (${(contentLength / 1024 / 1024).toFixed(1)}MB). Max: 2MB`;
  }
  return null;
}

/** Validate array length within bounds */
export function validateArrayLength(
  arr: unknown[],
  label: string,
  min = 1,
  max = 500,
): string | null {
  if (arr.length < min) return `${label}: at least ${min} item(s) required`;
  if (arr.length > max) return `${label}: maximum ${max} items allowed`;
  return null;
}

/** Rate limit key helper — returns a compound key for per-user per-action limiting */
export function rateLimitKey(userId: string, action: string): string {
  return `${userId}:${action}`;
}
