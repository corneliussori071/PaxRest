/**
 * Validate an email address.
 */
export function isValidEmail(email: string): boolean {
  const re = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  return re.test(email.trim());
}

/**
 * Validate a phone number (basic: at least 7 digits).
 */
export function isValidPhone(phone: string): boolean {
  const digits = phone.replace(/\D/g, '');
  return digits.length >= 7 && digits.length <= 15;
}

/**
 * Sanitize a string to prevent XSS (basic HTML escaping).
 * Port from Paxventory's escapeHtml function.
 */
export function escapeHtml(input: unknown): string {
  if (typeof input !== 'string') return '';
  return input
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');
}

/**
 * Clamp a string to a maximum length.
 * Port from Paxventory's clampStr function.
 */
export function clampStr(val: unknown, maxLen: number): string {
  if (typeof val !== 'string') return '';
  return val.trim().slice(0, maxLen);
}

/**
 * Validate numeric value is within range.
 */
export function isValidAmount(amount: number, min = 0, max = 999999.99): boolean {
  return typeof amount === 'number' && !isNaN(amount) && amount >= min && amount <= max;
}

/**
 * Validate a UUID format.
 */
export function isValidUUID(str: string): boolean {
  const re = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
  return re.test(str);
}

/**
 * Validate array length.
 */
export function isValidArrayLength<T>(arr: T[], min: number, max: number): boolean {
  return Array.isArray(arr) && arr.length >= min && arr.length <= max;
}

/**
 * Validate pagination parameters.
 */
export function validatePagination(page?: number, pageSize?: number): {
  page: number;
  page_size: number;
} {
  const validPage = typeof page === 'number' && page > 0 ? Math.floor(page) : 1;
  const validPageSize = typeof pageSize === 'number' && pageSize > 0 && pageSize <= 100
    ? Math.floor(pageSize)
    : 10;
  return { page: validPage, page_size: validPageSize };
}

/**
 * Validate a slug (URL-friendly string).
 */
export function isValidSlug(slug: string): boolean {
  return /^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(slug);
}

/**
 * Generate a URL-friendly slug from a string.
 */
export function generateSlug(text: string): string {
  return text
    .toLowerCase()
    .trim()
    .replace(/[^\w\s-]/g, '')
    .replace(/[\s_]+/g, '-')
    .replace(/-+/g, '-')
    .replace(/^-|-$/g, '');
}

/**
 * Validate required fields exist in an object.
 */
export function validateRequired<T extends Record<string, unknown>>(
  obj: T,
  fields: (keyof T)[]
): { valid: boolean; missing: string[] } {
  const missing: string[] = [];
  for (const field of fields) {
    const val = obj[field];
    if (val === undefined || val === null || val === '') {
      missing.push(String(field));
    }
  }
  return { valid: missing.length === 0, missing };
}
