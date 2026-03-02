/**
 * customer/index.ts — Public-facing Edge Function for the customer ordering app.
 * All actions use createServiceClient() for DB writes to avoid RLS barriers.
 * Auth-required actions (me, my-orders) validate the customer's Supabase JWT
 * and resolve the customers row via customer_auth_id.
 */

import { serve } from 'https://deno.land/std@0.208.0/http/server.ts';
import {
  corsResponse, jsonResponse, errorResponse,
  createServiceClient, isValidEmail, sanitizeString,
  validatePagination, applyPagination,
} from '../_shared/index.ts';

// ─── Simple in-request rate limiting (body size + field length) ─────────────

const MAX_STRING = 500;
const MAX_TEXT = 2000;

function safeStr(v: unknown, max = MAX_STRING): string {
  if (typeof v !== 'string') return '';
  return v.trim().slice(0, max);
}

// ─── Customer JWT helper ─────────────────────────────────────────────────────

async function resolveCustomer(req: Request): Promise<{ id: string; companyId: string } | null> {
  const authHeader = req.headers.get('Authorization') ?? '';
  if (!authHeader.startsWith('Bearer ')) return null;

  const { createClient } = await import('https://esm.sh/@supabase/supabase-js@2');
  const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!;
  const SUPABASE_ANON_KEY = Deno.env.get('SUPABASE_ANON_KEY')!;

  const client = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
    global: { headers: { Authorization: authHeader } },
    auth: { persistSession: false },
  });

  const { data: { user }, error } = await client.auth.getUser();
  if (error || !user) return null;

  const service = createServiceClient();
  const { data: customer } = await service
    .from('customers')
    .select('id, company_id')
    .eq('customer_auth_id', user.id)
    .maybeSingle();

  if (!customer) return null;
  return { id: customer.id, companyId: customer.company_id };
}

// ─── Main router ─────────────────────────────────────────────────────────────

serve(async (req) => {
  if (req.method === 'OPTIONS') return corsResponse();

  const url = new URL(req.url);
  const action = url.pathname.split('/').filter(Boolean).pop();

  try {
    switch (action) {
      case 'branches':     return await getBranches(req);
      case 'companies':    return await getCompanies(req);
      case 'menu':         return await getPublicMenu(req);
      case 'zones':        return await getZones(req);
      case 'tables':       return await getPublicTables(req);
      case 'rooms':        return await getPublicRooms(req);
      case 'order':        return await createOrder(req);
      case 'order-status': return await getOrderStatus(req);
      case 'signup':       return await signUp(req);
      case 'me':           return req.method === 'PATCH' ? updateMe(req) : getMe(req);
      case 'my-orders':    return await getMyOrders(req);
      case 'special-request': return await createSpecialRequest(req);
      case 'book-room':       return await bookRoom(req);
      default:             return errorResponse('Unknown customer action', 404);
    }
  } catch (err) {
    console.error('Customer function error:', err);
    return errorResponse(err?.message ?? 'Internal server error', 500);
  }
});

// ─── GET menu ───────────────────────────────────────────────────────────────
// Public menu with live kitchen status. No JWT required.
async function getPublicMenu(req: Request) {
  if (req.method !== 'GET') return errorResponse('Method not allowed', 405);

  const url = new URL(req.url);
  const branchId = url.searchParams.get('branch_id');
  if (!branchId) return errorResponse('Missing branch_id');

  const service = createServiceClient();

  // Categories
  const { data: categories, error: catErr } = await service
    .from('menu_categories')
    .select('id, name, description, image_url, sort_order')
    .eq('branch_id', branchId)
    .eq('is_active', true)
    .order('sort_order', { ascending: true });
  if (catErr) return errorResponse(catErr.message);

  // Items with related data
  const { data: items, error: itemErr } = await service
    .from('menu_items')
    .select(`
      id, name, description, base_price, image_url, media_url, media_type,
      availability_status, preparation_time_min, tags, allergens, calories,
      category_id,
      menu_variants(id, name, price_adjustment, is_active),
      menu_item_modifier_groups(modifier_groups(id, name, min_selections, max_selections, is_required, modifiers(id, name, price, is_active))),
      menu_item_ingredients(id, ingredient_id, name, cost_contribution, quantity_used, unit),
      menu_item_extras(id, name, price, is_available, sort_order)
    `)
    .eq('branch_id', branchId)
    .eq('is_active', true)
    .eq('is_available', true)
    .order('sort_order', { ascending: true });
  if (itemErr) return errorResponse(itemErr.message);

  // Available meals (kitchen "Available Now" queue)
  const { data: availableMeals } = await service
    .from('available_meals')
    .select('menu_item_id, quantity_available, availability_status')
    .eq('branch_id', branchId)
    .gt('quantity_available', 0);

  // Active meal assignments (kitchen is currently preparing)
  const { data: assignments } = await service
    .from('meal_assignments')
    .select('menu_item_id, quantity, status')
    .eq('branch_id', branchId)
    .in('status', ['pending', 'accepted', 'in_progress']);

  const availMap = new Map<string, { qty: number; status: string }>();
  for (const m of availableMeals ?? []) {
    availMap.set(m.menu_item_id, { qty: m.quantity_available, status: m.availability_status ?? 'available' });
  }

  const assignMap = new Map<string, number>();
  for (const a of assignments ?? []) {
    assignMap.set(a.menu_item_id, (assignMap.get(a.menu_item_id) ?? 0) + (a.quantity ?? 1));
  }

  const itemIds = new Set((items ?? []).map((i: any) => i.id));

  const menu = (categories ?? []).map((cat: any) => ({
    ...cat,
    items: (items ?? [])
      .filter((item: any) => item.category_id === cat.id)
      .map((item: any) => {
        const avail = availMap.get(item.id);
        const assignCount = assignMap.get(item.id) ?? 0;
        // kitchen_status: 'ready' | 'preparing' | null
        const kitchen_status = avail && avail.qty > 0 ? 'ready'
          : assignCount > 0 ? 'preparing'
          : null;
        return {
          ...item,
          available_quantity: avail?.qty ?? 0,
          assignment_count: assignCount,
          kitchen_status,
        };
      }),
  }));

  return jsonResponse({ menu });
}

// ─── GET companies ──────────────────────────────────────────────────────────
// Returns all active companies (public info only — name, slug, logo).
async function getCompanies(req: Request) {
  if (req.method !== 'GET') return errorResponse('Method not allowed', 405);
  const service = createServiceClient();
  const { data, error } = await service
    .from('companies')
    .select('id, name, slug, currency, logo_url')
    .eq('is_active', true)
    .order('name', { ascending: true });
  if (error) return errorResponse(error.message);
  return jsonResponse({ companies: data ?? [] });
}

// ─── GET branches ────────────────────────────────────────────────────────────
// Returns all active branches for a given company slug.
// If no slug is provided AND there is only one active company, auto-selects it.
async function getBranches(req: Request) {
  if (req.method !== 'GET') return errorResponse('Method not allowed', 405);

  const url = new URL(req.url);
  const slug = url.searchParams.get('company_slug') ?? '';

  const service = createServiceClient();

  let company: { id: string; name: string; currency: string; logo_url: string | null } | null = null;

  if (slug) {
    const { data, error: cErr } = await service
      .from('companies')
      .select('id, name, currency, logo_url')
      .eq('slug', slug)
      .eq('is_active', true)
      .maybeSingle();
    if (cErr || !data) return errorResponse('Company not found', 404);
    company = data;
  } else {
    // No slug provided — auto-select when there is exactly one active company
    const { data, error: cErr } = await service
      .from('companies')
      .select('id, name, currency, logo_url')
      .eq('is_active', true);
    if (cErr || !data || data.length === 0) return errorResponse('No company found', 404);
    if (data.length > 1) return errorResponse('Multiple companies found — provide company_slug param', 400);
    company = data[0];
  }

  const { data: branches, error: bErr } = await service
    .from('branches')
    .select('id, name, address, phone, email, currency, timezone')
    .eq('company_id', company.id)
    .eq('is_active', true)
    .order('name', { ascending: true });

  if (bErr) return errorResponse(bErr.message);

  return jsonResponse({ company, branches: branches ?? [] });
}

// ─── GET zones ───────────────────────────────────────────────────────────────
// Returns active delivery zones for a branch.

async function getZones(req: Request) {
  if (req.method !== 'GET') return errorResponse('Method not allowed', 405);

  const url = new URL(req.url);
  const branchId = url.searchParams.get('branch_id');
  if (!branchId) return errorResponse('Missing branch_id');

  const service = createServiceClient();
  const { data, error } = await service
    .from('delivery_zones')
    .select('id, name, delivery_fee, min_order_amount, estimated_minutes')
    .eq('branch_id', branchId)
    .eq('is_active', true)
    .order('name', { ascending: true });

  if (error) return errorResponse(error.message);
  return jsonResponse({ zones: data ?? [] });
}

// ─── POST order ──────────────────────────────────────────────────────────────
// Creates a customer order via the existing create_order_with_deduction RPC.

async function createOrder(req: Request) {
  if (req.method !== 'POST') return errorResponse('Method not allowed', 405);

  const body = await req.json().catch(() => null);
  if (!body || !body.branch_id || !body.order_type || !body.items?.length) {
    return errorResponse('Missing branch_id, order_type, or items');
  }
  if (!body.customer_name || !body.customer_phone) {
    return errorResponse('Customer name and phone are required');
  }
  if (body.order_type === 'delivery' && !body.delivery_address) {
    return errorResponse('Delivery address is required for delivery orders');
  }

  // Map 'pickup' → 'takeaway' to match DB enum
  const dbOrderType = body.order_type === 'pickup' ? 'takeaway' : body.order_type;

  const service = createServiceClient();

  // Resolve company_id from branch
  const { data: branch, error: bErr } = await service
    .from('branches')
    .select('company_id')
    .eq('id', body.branch_id)
    .single();

  if (bErr || !branch) return errorResponse('Branch not found', 404);

  // Prefer the authenticated customer if the request carries a valid JWT
  const authedCustomer = await resolveCustomer(req);
  let customerId: string | null = authedCustomer?.id ?? null;

  if (customerId) {
    // Keep name/email up-to-date on the auth-linked row
    await service
      .from('customers')
      .update({
        name: sanitizeString(body.customer_name),
        email: body.customer_email ?? undefined,
        phone: body.customer_phone,
        updated_at: new Date().toISOString(),
      })
      .eq('id', customerId);
  } else {
    // Fall back: find-or-create by phone
    const { data: existingCustomer } = await service
      .from('customers')
      .select('id')
      .eq('company_id', branch.company_id)
      .eq('phone', body.customer_phone)
      .maybeSingle();

    if (existingCustomer) {
      customerId = existingCustomer.id;
      await service
        .from('customers')
        .update({
          name: sanitizeString(body.customer_name),
          email: body.customer_email ?? undefined,
          updated_at: new Date().toISOString(),
        })
        .eq('id', customerId!);
    } else {
      const { data: newCust } = await service
        .from('customers')
        .insert({
          company_id: branch.company_id,
          name: sanitizeString(body.customer_name),
          phone: body.customer_phone,
          email: body.customer_email ?? null,
        })
        .select('id')
        .single();
      customerId = newCust?.id ?? null;
    }
  }

  // Build delivery address for DB (jsonb format)
  let customerAddress: object | null = null;
  if (body.delivery_address) {
    const addr = body.delivery_address;
    customerAddress = {
      street: safeStr(addr.line1 ?? addr.street ?? ''),
      city: safeStr(addr.city ?? ''),
      lat: typeof addr.lat === 'number' ? addr.lat : null,
      lng: typeof addr.lng === 'number' ? addr.lng : null,
      instructions: safeStr(addr.instructions ?? body.delivery_notes ?? ''),
    };
  }

  // Create order via atomic RPC
  const { data, error } = await service.rpc('create_order_with_deduction', {
    p_company_id: branch.company_id,
    p_branch_id: body.branch_id,
    p_order_type: dbOrderType,
    p_table_id: null,
    p_customer_id: customerId,
    p_customer_name: sanitizeString(body.customer_name),
    p_customer_phone: body.customer_phone,
    p_customer_email: body.customer_email ?? null,
    p_customer_address: customerAddress,
    p_notes: body.notes ? safeStr(body.notes, MAX_TEXT) : null,
    p_source: 'online',
    p_shift_id: null,
    p_created_by: null,
    p_created_by_name: 'Online Order',
    p_tax_rate: 0,
    p_discount_amount: 0,
    p_discount_reason: null,
    p_tip_amount: 0,
    p_delivery_fee: body.delivery_fee ?? 0,
    p_loyalty_points_used: 0,
    p_loyalty_discount: 0,
    p_items: body.items,
  });

  if (error) return errorResponse(error.message, 400);

  // If delivery order, create delivery record
  if (dbOrderType === 'delivery' && data?.order_id) {
    const deliveryRec: Record<string, unknown> = {
      company_id: branch.company_id,
      branch_id: body.branch_id,
      order_id: data.order_id,
      order_number: data.order_number,
      status: 'pending_assignment',
      customer_name: sanitizeString(body.customer_name),
      customer_phone: body.customer_phone ?? '',
      delivery_fee: body.delivery_fee ?? 0,
      notes: body.notes ? safeStr(body.notes, MAX_TEXT) : null,
    };
    if (body.delivery_zone_id) deliveryRec.delivery_zone_id = body.delivery_zone_id;
    if (body.delivery_address) {
      const addr = body.delivery_address;
      deliveryRec.delivery_address = {
        street: safeStr(addr.line1 ?? addr.street ?? ''),
        city: safeStr(addr.city ?? ''),
        lat: typeof addr.lat === 'number' ? addr.lat : null,
        lng: typeof addr.lng === 'number' ? addr.lng : null,
        instructions: safeStr(addr.instructions ?? body.delivery_notes ?? ''),
      };
    }
    const { error: delErr } = await service.from('deliveries').insert(deliveryRec);
    if (delErr) console.error('Delivery record creation failed:', delErr.message);
  }

  return jsonResponse({ order_id: data?.order_id, order_number: data?.order_number }, 201);
}

// ─── GET order-status ────────────────────────────────────────────────────────
// Public order tracking — must pass order_id. Returns minimal order details.

async function getOrderStatus(req: Request) {
  if (req.method !== 'GET') return errorResponse('Method not allowed', 405);

  const url = new URL(req.url);
  const orderId = url.searchParams.get('id');
  if (!orderId) return errorResponse('Missing id');

  const service = createServiceClient();
  const { data, error } = await service
    .from('orders')
    .select(`
      id, order_number, status, order_type, source,
      customer_name, customer_phone, notes,
      subtotal, tax_amount, discount_amount, delivery_fee, total,
      is_special_request, special_request_notes,
      created_at, updated_at,
      order_items(
        id, quantity, unit_price, notes,
        menu_items(name)
      )
    `)
    .eq('id', orderId)
    .single();

  if (error) return errorResponse('Order not found', 404);

  // Normalise the response shape expected by the track page
  const order = {
    ...data,
    discount: (data as any).discount_amount ?? 0,
    tax: (data as any).tax_amount ?? 0,
    items: ((data as any).order_items ?? []).map((oi: any) => ({
      id: oi.id,
      name: oi.menu_items?.name ?? oi.notes ?? 'Item',
      quantity: oi.quantity,
      unit_price: oi.unit_price,
      notes: oi.notes,
    })),
  };

  return jsonResponse({ order });
}

// ─── POST signup ─────────────────────────────────────────────────────────────
// Creates a Supabase Auth user + customers row.

async function signUp(req: Request) {
  if (req.method !== 'POST') return errorResponse('Method not allowed', 405);

  const body = await req.json().catch(() => null);
  if (!body) return errorResponse('Invalid JSON');

  const { email, password, name, phone } = body;
  if (!email || !password || !name || !phone) {
    return errorResponse('email, password, name, and phone are required');
  }
  if (!isValidEmail(email)) return errorResponse('Invalid email format');
  if (typeof password !== 'string' || password.length < 8) {
    return errorResponse('Password must be at least 8 characters');
  }

  const service = createServiceClient();

  // Resolve company from branch (branch_id comes from the cart)
  const branchId = body.branch_id;
  if (!branchId) return errorResponse('branch_id is required');

  const { data: branch } = await service
    .from('branches')
    .select('company_id')
    .eq('id', branchId)
    .single();

  if (!branch) return errorResponse('Branch not found', 404);

  // Check if email already registered as a customer
  const { data: existingAuth } = await service.auth.admin.listUsers({ perPage: 1 });
  const { data: existingCust } = await service
    .from('customers')
    .select('id')
    .eq('company_id', branch.company_id)
    .eq('email', email)
    .maybeSingle();

  if (existingCust) return errorResponse('An account with this email already exists', 409);

  // Create Supabase Auth user
  const { data: authData, error: authErr } = await service.auth.admin.createUser({
    email,
    password,
    email_confirm: true,
    user_metadata: {
      name: sanitizeString(name),
      phone,
      role: 'customer',
    },
  });

  if (authErr) return errorResponse(authErr.message, 400);
  const userId = authData.user.id;

  // Upsert into customers (by phone for deduplication)
  const { data: existing } = await service
    .from('customers')
    .select('id')
    .eq('company_id', branch.company_id)
    .eq('phone', phone)
    .maybeSingle();

  let customerId: string;

  if (existing) {
    // Link existing customer record to this auth user
    await service
      .from('customers')
      .update({ customer_auth_id: userId, email, name: sanitizeString(name) })
      .eq('id', existing.id);
    customerId = existing.id;
  } else {
    const { data: newCust, error: custErr } = await service
      .from('customers')
      .insert({
        company_id: branch.company_id,
        name: sanitizeString(name),
        email,
        phone,
        customer_auth_id: userId,
      })
      .select('id')
      .single();
    if (custErr) {
      await service.auth.admin.deleteUser(userId);
      return errorResponse('Failed to create customer profile: ' + custErr.message);
    }
    customerId = newCust.id;
  }

  return jsonResponse({ customer_id: customerId, message: 'Account created. Please sign in.' }, 201);
}

// ─── GET me ──────────────────────────────────────────────────────────────────
// Returns the customer's profile (JWT required).

async function getMe(req: Request) {
  const ctx = await resolveCustomer(req);
  if (!ctx) return errorResponse('Unauthorized', 401);

  const service = createServiceClient();
  const { data, error } = await service
    .from('customers')
    .select('id, name, email, phone, loyalty_points_balance, total_spent, total_orders, created_at')
    .eq('id', ctx.id)
    .single();

  if (error) return errorResponse(error.message);
  return jsonResponse({ customer: data });
}

// ─── PATCH me ────────────────────────────────────────────────────────────────
// Updates the customer's profile (JWT required).

async function updateMe(req: Request) {
  const ctx = await resolveCustomer(req);
  if (!ctx) return errorResponse('Unauthorized', 401);

  const body = await req.json().catch(() => null);
  if (!body) return errorResponse('Invalid JSON');

  const update: Record<string, unknown> = {};
  if (body.name) update.name = sanitizeString(body.name);
  if (body.phone) update.phone = body.phone;
  if (body.email) {
    if (!isValidEmail(body.email)) return errorResponse('Invalid email');
    update.email = body.email;
  }

  if (Object.keys(update).length === 0) return errorResponse('No fields to update');

  const service = createServiceClient();
  const { data, error } = await service
    .from('customers')
    .update(update)
    .eq('id', ctx.id)
    .select('id, name, email, phone, loyalty_points_balance, total_spent, total_orders')
    .single();

  if (error) return errorResponse(error.message);
  return jsonResponse({ customer: data });
}

// ─── GET my-orders ───────────────────────────────────────────────────────────
// Paginated list of the authenticated customer's orders.

async function getMyOrders(req: Request) {
  const ctx = await resolveCustomer(req);
  if (!ctx) return errorResponse('Unauthorized', 401);

  const url = new URL(req.url);
  const branchId = url.searchParams.get('branch_id');
  const { page, pageSize } = validatePagination({
    page: Number(url.searchParams.get('page')),
    page_size: Number(url.searchParams.get('page_size')),
  }, ['created_at']);

  const service = createServiceClient();
  let query = service
    .from('orders')
    .select('id, order_number, status, order_type, total, created_at, is_special_request', { count: 'exact' })
    .eq('customer_id', ctx.id);

  if (branchId) query = query.eq('branch_id', branchId);

  query = applyPagination(query, page, pageSize, 'created_at', false);
  const { data, count, error } = await query;

  if (error) return errorResponse(error.message);
  return jsonResponse({
    orders: data ?? [],
    total: count ?? 0,
    page,
    page_size: pageSize,
    total_pages: Math.ceil((count ?? 0) / pageSize),
  });
}

// ─── POST special-request ────────────────────────────────────────────────────
// Creates an order with awaiting_approval status for staff review.

async function createSpecialRequest(req: Request) {
  if (req.method !== 'POST') return errorResponse('Method not allowed', 405);

  const body = await req.json().catch(() => null);
  if (!body || !body.branch_id) {
    return errorResponse('Missing branch_id');
  }
  if (!body.customer_name || !body.customer_phone) {
    return errorResponse('Customer name and phone are required');
  }

  const service = createServiceClient();

  const { data: branch } = await service
    .from('branches')
    .select('company_id')
    .eq('id', body.branch_id)
    .single();

  if (!branch) return errorResponse('Branch not found', 404);

  // Upsert customer
  let customerId: string | null = null;
  const { data: existing } = await service
    .from('customers')
    .select('id')
    .eq('company_id', branch.company_id)
    .eq('phone', body.customer_phone)
    .maybeSingle();

  if (existing) {
    customerId = existing.id;
  } else {
    const { data: newCust } = await service
      .from('customers')
      .insert({
        company_id: branch.company_id,
        name: sanitizeString(body.customer_name),
        phone: body.customer_phone,
        email: body.customer_email ?? null,
      })
      .select('id').single();
    customerId = newCust?.id ?? null;
  }

  // Build items array from various input formats:
  // 1. Legacy: body.items array already provided
  // 2. Single item: body.item_id + body.item_name
  // 3. Enquiry only (reservation/event): empty array
  let rpcItems: unknown[] = [];
  if (Array.isArray(body.items) && body.items.length > 0) {
    rpcItems = body.items;
  } else if (body.item_name) {
    rpcItems = [{
      menu_item_id: body.item_id ?? null,
      menu_item_name: safeStr(body.item_name),
      quantity: 1,
      unit_price: 0,
      modifiers: [],
      modifiers_total: 0,
      special_instructions: body.special_request_notes ? safeStr(body.special_request_notes, MAX_TEXT) : null,
    }];
  }
  // else enquiry with empty items — order acts as a notification ticket

  // Map 'pickup' → 'takeaway'; default to 'dine_in' if not provided
  const rawType = body.order_type ?? 'dine_in';
  const dbOrderType = rawType === 'pickup' ? 'takeaway' : rawType;

  // Create order via RPC first (status will be overridden to awaiting_approval below)
  const { data: orderData, error: rpcErr } = await service.rpc('create_order_with_deduction', {
    p_company_id: branch.company_id,
    p_branch_id: body.branch_id,
    p_order_type: dbOrderType,
    p_table_id: null,
    p_customer_id: customerId,
    p_customer_name: sanitizeString(body.customer_name),
    p_customer_phone: body.customer_phone,
    p_customer_email: body.customer_email ?? null,
    p_customer_address: body.delivery_address ?? null,
    p_notes: body.notes ? safeStr(body.notes, MAX_TEXT) : null,
    p_source: 'online',
    p_shift_id: null,
    p_created_by: null,
    p_created_by_name: 'Special Request (Online)',
    p_tax_rate: 0,
    p_discount_amount: 0,
    p_discount_reason: null,
    p_tip_amount: 0,
    p_delivery_fee: 0,
    p_loyalty_points_used: 0,
    p_loyalty_discount: 0,
    p_items: rpcItems,
  });

  if (rpcErr) return errorResponse(rpcErr.message, 400);

  const orderId = orderData?.order_id;

  // Override status to awaiting_approval and add special request fields
  await service
    .from('orders')
    .update({
      status: 'awaiting_approval' as any,
      is_special_request: true,
      special_request_notes: body.special_request_notes
        ? safeStr(body.special_request_notes, MAX_TEXT)
        : null,
    })
    .eq('id', orderId);

  return jsonResponse({
    order_id: orderId,
    order_number: orderData?.order_number,
    message: 'Your special request has been sent. Staff will review and confirm shortly.',
  }, 201);
}

// ─── GET /customer/tables ────────────────────────────────────────────────────
// Public — returns available (and all) tables for a branch so customers can
// see seating options and make walk-in / dine-in reservation requests.

async function getPublicTables(req: Request) {
  if (req.method !== 'GET') return errorResponse('Method not allowed', 405);

  const url = new URL(req.url);
  const branchId = url.searchParams.get('branch_id');
  if (!branchId) return errorResponse('Missing branch_id');

  const service = createServiceClient();
  const { data, error } = await service
    .from('tables')
    .select('id, table_number, name, capacity, section, status')
    .eq('branch_id', branchId)
    .eq('is_active', true)
    .order('table_number', { ascending: true });

  if (error) return errorResponse(error.message, 500);
  return jsonResponse({ tables: data ?? [] });
}

// ─── GET /customer/rooms ─────────────────────────────────────────────────────
// Public — returns available rooms/halls for customer browsing and enquiry
// (conference halls, event rooms, suites, etc.).

async function getPublicRooms(req: Request) {
  if (req.method !== 'GET') return errorResponse('Method not allowed', 405);

  const url = new URL(req.url);
  const branchId = url.searchParams.get('branch_id');
  if (!branchId) return errorResponse('Missing branch_id');

  const service = createServiceClient();
  const { data, error } = await service
    .from('rooms')
    .select('id, room_number, floor_section, max_occupants, category, cost_amount, cost_duration, benefits, media_url, media_type, status')
    .eq('branch_id', branchId)
    .eq('is_active', true)
    .order('room_number', { ascending: true });

  if (error) return errorResponse(error.message, 500);
  return jsonResponse({ rooms: data ?? [] });
}

// ─── POST /customer/book-room ─────────────────────────────────────────────────
// Books a room: creates an order, a guest_bookings record, and sets room → reserved.

async function bookRoom(req: Request) {
  if (req.method !== 'POST') return errorResponse('Method not allowed', 405);

  const body = await req.json().catch(() => null);
  if (!body) return errorResponse('Invalid JSON');

  const { branch_id, room_id, customer_name, customer_phone } = body;
  if (!branch_id || !room_id || !customer_name || !customer_phone) {
    return errorResponse('branch_id, room_id, customer_name, and customer_phone are required');
  }

  const service = createServiceClient();

  // Fetch branch + room
  const [{ data: branch }, { data: room }] = await Promise.all([
    service.from('branches').select('company_id').eq('id', branch_id).single(),
    service
      .from('rooms')
      .select('id, room_number, category, cost_amount, cost_duration, max_occupants, status, company_id')
      .eq('id', room_id)
      .single(),
  ]);

  if (!branch) return errorResponse('Branch not found', 404);
  if (!room) return errorResponse('Room not found', 404);
  if (room.status !== 'available') {
    return errorResponse(`Room is not available (status: ${room.status})`, 409);
  }

  // Resolve customer — JWT account takes priority so orders appear in "My Orders"
  let customerId: string | null = null;
  const jwtCtx = await resolveCustomer(req);
  if (jwtCtx) {
    customerId = jwtCtx.id;
    // Optionally update email if freshly provided
    if (body.customer_email) {
      await service.from('customers').update({ email: body.customer_email }).eq('id', customerId);
    }
  } else {
    // Fallback: find or create by phone
    const { data: existing } = await service
      .from('customers')
      .select('id')
      .eq('company_id', branch.company_id)
      .eq('phone', customer_phone)
      .maybeSingle();

    if (existing) {
      customerId = existing.id;
    } else {
      const { data: newCust } = await service
        .from('customers')
        .insert({
          company_id: branch.company_id,
          name: sanitizeString(customer_name),
          phone: customer_phone,
          email: body.customer_email ?? null,
        })
        .select('id').single();
      customerId = newCust?.id ?? null;
    }
  }

  // Build notes from booking details
  const checkIn = body.check_in ?? null;
  const checkOut = body.check_out ?? null;
  const durationCount = Number(body.duration_count ?? 1);
  const durationUnit = safeStr(body.duration_unit ?? 'night');
  const numOccupants = Number(body.num_occupants ?? 1);
  const notes = body.notes ? safeStr(body.notes, MAX_TEXT) : null;

  const noteParts = [
    `Room ${room.room_number} (${room.category})`,
    checkIn ? `Check-in: ${checkIn}` : null,
    checkOut ? `Check-out: ${checkOut}` : null,
    !checkIn ? `Duration: ${durationCount} ${durationUnit}(s)` : null,
    `Guests: ${numOccupants}`,
    notes ? `Notes: ${notes}` : null,
  ].filter(Boolean);

  // Create order via RPC
  const { data: orderData, error: rpcErr } = await service.rpc('create_order_with_deduction', {
    p_company_id: branch.company_id,
    p_branch_id: branch_id,
    p_order_type: 'accommodation',
    p_table_id: null,
    p_customer_id: customerId,
    p_customer_name: sanitizeString(customer_name),
    p_customer_phone: customer_phone,
    p_customer_email: body.customer_email ?? null,
    p_customer_address: null,
    p_notes: noteParts.join(' | '),
    p_source: 'online',
    p_shift_id: null,
    p_created_by: null,
    p_created_by_name: 'Online Booking',
    p_tax_rate: 0,
    p_discount_amount: 0,
    p_discount_reason: null,
    p_tip_amount: 0,
    p_delivery_fee: 0,
    p_loyalty_points_used: 0,
    p_loyalty_discount: 0,
    p_items: [{
      menu_item_id: null,
      menu_item_name: `Room Booking — ${room.category.charAt(0).toUpperCase() + room.category.slice(1)} (${room.room_number})`,
      quantity: durationCount,
      unit_price: room.cost_amount,
      modifiers: [],
      modifiers_total: 0,
      special_instructions: null,
    }],
  });

  if (rpcErr) return errorResponse(rpcErr.message, 400);

  const orderId = orderData?.order_id;
  const orderNumber = orderData?.order_number;

  // Mark order as awaiting_approval so staff reviews it
  await service
    .from('orders')
    .update({ status: 'awaiting_approval' as any, linked_room_id: room_id, linked_room_number: room.room_number })
    .eq('id', orderId);

  // Update room status → reserved
  await service.from('rooms').update({ status: 'reserved' }).eq('id', room_id);

  // Create guest_bookings record
  const { data: booking, error: bookingErr } = await service
    .from('guest_bookings')
    .insert({
      company_id: branch.company_id,
      branch_id,
      room_id,
      room_number: room.room_number,
      order_id: orderId,
      order_number: orderNumber,
      customer_name: sanitizeString(customer_name),
      num_occupants: numOccupants,
      scheduled_check_in: checkIn,
      scheduled_check_out: checkOut,
      duration_count: durationCount,
      duration_unit: durationUnit,
      notes,
      status: 'pending_checkin',
    })
    .select('id')
    .single();

  if (bookingErr) console.error('guest_bookings insert failed:', bookingErr.message);

  return jsonResponse({
    order_id: orderId,
    order_number: orderNumber,
    booking_id: booking?.id ?? null,
    message: 'Room reserved! Your booking reference is ready. Staff will confirm shortly.',
  }, 201);
}
