import { serve } from 'https://deno.land/std@0.208.0/http/server.ts';
import {
  corsResponse, jsonResponse, errorResponse,
  createUserClient, requireAuth, hasPermission, resolveBranchId,
  sanitizeString, applyPagination, validatePagination,
} from '../_shared/index.ts';
import type { AuthContext } from '../_shared/index.ts';

serve(async (req) => {
  if (req.method === 'OPTIONS') return corsResponse();

  const url = new URL(req.url);
  const segments = url.pathname.split('/').filter(Boolean);
  const action = segments.pop();

  try {
    const supabase = createUserClient(req);
    const authResult = await requireAuth(supabase, req);
    if (authResult instanceof Response) return authResult;
    const auth = authResult as AuthContext;
    const branchId = resolveBranchId(auth, req);
    if (!branchId) return errorResponse('No branch context');

    switch (action) {
      // Categories
      case 'categories':
        return req.method === 'GET'
          ? await listCategories(supabase, auth, branchId)
          : await upsertCategory(req, supabase, auth, branchId);
      case 'category':
        return req.method === 'DELETE'
          ? await deleteCategory(req, supabase, auth, branchId)
          : errorResponse('Use categories endpoint', 400);

      // Items
      case 'items':
        return req.method === 'GET'
          ? await listItems(req, supabase, auth, branchId)
          : await upsertItem(req, supabase, auth, branchId);
      case 'item':
        if (req.method === 'GET') return await getItem(req, supabase, auth, branchId);
        if (req.method === 'DELETE') return await deleteItem(req, supabase, auth, branchId);
        return errorResponse('Use items endpoint', 400);

      // Variants
      case 'variants':
        return await manageVariants(req, supabase, auth);

      // Modifier groups
      case 'modifier-groups':
        return req.method === 'GET'
          ? await listModifierGroups(supabase, auth, branchId)
          : await upsertModifierGroup(req, supabase, auth, branchId);

      // Full menu (for POS/customer)
      case 'full':
        return await getFullMenu(supabase, auth, branchId);

      // Public menu (unauthenticated, for customer app)
      case 'public-menu':
        return await getPublicMenu(req, supabase);

      default:
        return errorResponse('Unknown menu action', 404);
    }
  } catch (err) {
    console.error('Menu error:', err);
    return errorResponse(err.message ?? 'Internal server error', 500);
  }
});

// ─── Categories ─────────────────────────────────────────────────────────────

async function listCategories(supabase: any, auth: AuthContext, branchId: string) {
  const { data, error } = await supabase
    .from('menu_categories')
    .select('*')
    .eq('branch_id', branchId)
    .order('sort_order', { ascending: true });

  if (error) return errorResponse(error.message);
  return jsonResponse({ categories: data });
}

async function upsertCategory(req: Request, supabase: any, auth: AuthContext, branchId: string) {
  if (!hasPermission(auth, 'manage_menu')) return errorResponse('Forbidden', 403);
  const body = await req.json();

  if (!body.name) return errorResponse('Missing category name');

  const record = {
    company_id: auth.companyId,
    branch_id: branchId,
    name: sanitizeString(body.name),
    description: body.description ? sanitizeString(body.description) : null,
    image_url: body.image_url ?? null,
    sort_order: body.sort_order ?? 0,
    is_active: body.is_active ?? true,
  };

  if (body.id) {
    // Update
    const { data, error } = await supabase
      .from('menu_categories')
      .update(record)
      .eq('id', body.id)
      .eq('branch_id', branchId)
      .select()
      .single();
    if (error) return errorResponse(error.message);
    return jsonResponse({ category: data });
  } else {
    // Insert
    const { data, error } = await supabase
      .from('menu_categories')
      .insert(record)
      .select()
      .single();
    if (error) return errorResponse(error.message);
    return jsonResponse({ category: data }, 201);
  }
}

async function deleteCategory(req: Request, supabase: any, auth: AuthContext, branchId: string) {
  if (!hasPermission(auth, 'manage_menu')) return errorResponse('Forbidden', 403);
  const url = new URL(req.url);
  const id = url.searchParams.get('id');
  if (!id) return errorResponse('Missing category id');

  // Soft-delete: set is_active = false
  const { error } = await supabase
    .from('menu_categories')
    .update({ is_active: false })
    .eq('id', id)
    .eq('branch_id', branchId);

  if (error) return errorResponse(error.message);
  return jsonResponse({ deleted: true });
}

// ─── Items ──────────────────────────────────────────────────────────────────

async function listItems(req: Request, supabase: any, auth: AuthContext, branchId: string) {
  const url = new URL(req.url);
  const categoryId = url.searchParams.get('category_id');
  const { page, pageSize, sortColumn, sortDirection } = validatePagination(
    {
      page: Number(url.searchParams.get('page')),
      page_size: Number(url.searchParams.get('page_size')),
      sort_column: url.searchParams.get('sort_column') ?? undefined,
      sort_direction: url.searchParams.get('sort_direction') ?? undefined,
    },
    ['created_at', 'name', 'base_price', 'sort_order'],
  );

  let query = supabase
    .from('menu_items')
    .select('*, menu_variants(*), menu_item_modifier_groups(*, modifier_groups(*, modifiers(*)))', { count: 'exact' })
    .eq('branch_id', branchId);

  if (categoryId) query = query.eq('category_id', categoryId);

  const ascending = sortDirection === 'ASC';
  query = applyPagination(query, page, pageSize, sortColumn, ascending);

  const { data, count, error } = await query;
  if (error) return errorResponse(error.message);

  return jsonResponse({
    items: data,
    total: count,
    page,
    page_size: pageSize,
    total_pages: Math.ceil((count ?? 0) / pageSize),
  });
}

async function getItem(req: Request, supabase: any, auth: AuthContext, branchId: string) {
  const url = new URL(req.url);
  const id = url.searchParams.get('id');
  if (!id) return errorResponse('Missing item id');

  const { data, error } = await supabase
    .from('menu_items')
    .select('*, menu_variants(*), menu_item_modifier_groups(*, modifier_groups(*, modifiers(*))), menu_item_ingredients(*), menu_item_extras(*)')
    .eq('id', id)
    .eq('branch_id', branchId)
    .single();

  if (error) return errorResponse(error.message);
  return jsonResponse({ item: data });
}

async function upsertItem(req: Request, supabase: any, auth: AuthContext, branchId: string) {
  if (!hasPermission(auth, 'manage_menu')) return errorResponse('Forbidden', 403);
  const body = await req.json();

  if (!body.name || !body.category_id || body.base_price === undefined) {
    return errorResponse('Missing required fields: name, category_id, base_price');
  }

  const record = {
    company_id: auth.companyId,
    branch_id: branchId,
    category_id: body.category_id,
    name: sanitizeString(body.name),
    description: body.description ? sanitizeString(body.description) : null,
    base_price: body.base_price,
    station: body.station ?? 'kitchen',
    is_available: body.is_available ?? true,
    availability_status: body.availability_status ?? 'available',
    is_active: body.is_active ?? true,
    sort_order: body.sort_order ?? 0,
    preparation_time_min: body.prep_time_minutes ?? body.preparation_time_min ?? 15,
    image_url: body.image_url ?? null,
    media_url: body.media_url ?? null,
    media_type: body.media_type ?? null,
    tags: body.tags ?? [],
    allergens: body.allergens ?? [],
    calories: body.calories ?? null,
  };

  if (body.id) {
    const { data, error } = await supabase
      .from('menu_items')
      .update(record)
      .eq('id', body.id)
      .eq('branch_id', branchId)
      .select()
      .single();
    if (error) return errorResponse(error.message);

    if (body.ingredients) {
      await syncIngredients(supabase, body.id, body.ingredients);
    }
    if (body.extras) {
      await syncExtras(supabase, body.id, body.extras);
    }

    return jsonResponse({ item: data });
  } else {
    const { data, error } = await supabase
      .from('menu_items')
      .insert(record)
      .select()
      .single();
    if (error) return errorResponse(error.message);

    if (body.ingredients) {
      await syncIngredients(supabase, data.id, body.ingredients);
    }
    if (body.extras) {
      await syncExtras(supabase, data.id, body.extras);
    }

    return jsonResponse({ item: data }, 201);
  }
}

async function deleteItem(req: Request, supabase: any, auth: AuthContext, branchId: string) {
  if (!hasPermission(auth, 'manage_menu')) return errorResponse('Forbidden', 403);
  const url = new URL(req.url);
  const id = url.searchParams.get('id');
  if (!id) return errorResponse('Missing item id');

  const { error } = await supabase
    .from('menu_items')
    .update({ is_active: false })
    .eq('id', id)
    .eq('branch_id', branchId);

  if (error) return errorResponse(error.message);
  return jsonResponse({ deleted: true });
}

// ─── Variants ───────────────────────────────────────────────────────────────

async function manageVariants(req: Request, supabase: any, auth: AuthContext) {
  if (!hasPermission(auth, 'manage_menu')) return errorResponse('Forbidden', 403);
  const body = await req.json();

  if (req.method === 'POST') {
    if (!body.menu_item_id || !body.name) return errorResponse('Missing menu_item_id or name');
    const { data, error } = await supabase
      .from('menu_variants')
      .insert({
        menu_item_id: body.menu_item_id,
        name: sanitizeString(body.name),
        price_adjustment: body.price_adjustment ?? 0,
        sku: body.sku ?? null,
        is_available: body.is_available ?? true,
        sort_order: body.sort_order ?? 0,
      })
      .select()
      .single();
    if (error) return errorResponse(error.message);
    return jsonResponse({ variant: data }, 201);
  }

  if (req.method === 'PUT') {
    if (!body.id) return errorResponse('Missing variant id');
    const updates: Record<string, unknown> = {};
    if (body.name) updates.name = sanitizeString(body.name);
    if (body.price_adjustment !== undefined) updates.price_adjustment = body.price_adjustment;
    if (body.is_available !== undefined) updates.is_available = body.is_available;
    if (body.sort_order !== undefined) updates.sort_order = body.sort_order;

    const { data, error } = await supabase
      .from('menu_variants')
      .update(updates)
      .eq('id', body.id)
      .select()
      .single();
    if (error) return errorResponse(error.message);
    return jsonResponse({ variant: data });
  }

  if (req.method === 'DELETE') {
    const url = new URL(req.url);
    const id = url.searchParams.get('id');
    if (!id) return errorResponse('Missing variant id');
    const { error } = await supabase.from('menu_variants').delete().eq('id', id);
    if (error) return errorResponse(error.message);
    return jsonResponse({ deleted: true });
  }

  return errorResponse('Method not allowed', 405);
}

// ─── Modifier Groups ────────────────────────────────────────────────────────

async function listModifierGroups(supabase: any, auth: AuthContext, branchId: string) {
  const { data, error } = await supabase
    .from('modifier_groups')
    .select('*, modifiers(*)')
    .eq('branch_id', branchId)
    .order('sort_order', { ascending: true });

  if (error) return errorResponse(error.message);
  return jsonResponse({ modifier_groups: data });
}

async function upsertModifierGroup(req: Request, supabase: any, auth: AuthContext, branchId: string) {
  if (!hasPermission(auth, 'manage_menu')) return errorResponse('Forbidden', 403);
  const body = await req.json();

  if (!body.name) return errorResponse('Missing modifier group name');

  const record = {
    company_id: auth.companyId,
    branch_id: branchId,
    name: sanitizeString(body.name),
    min_selections: body.min_selections ?? 0,
    max_selections: body.max_selections ?? 1,
    is_required: body.is_required ?? false,
    sort_order: body.sort_order ?? 0,
  };

  if (body.id) {
    const { data, error } = await supabase
      .from('modifier_groups')
      .update(record)
      .eq('id', body.id)
      .select()
      .single();
    if (error) return errorResponse(error.message);

    // Sync modifiers within the group
    if (body.modifiers) {
      await syncModifiers(supabase, body.id, body.modifiers);
    }

    return jsonResponse({ modifier_group: data });
  } else {
    const { data, error } = await supabase
      .from('modifier_groups')
      .insert(record)
      .select()
      .single();
    if (error) return errorResponse(error.message);

    if (body.modifiers) {
      await syncModifiers(supabase, data.id, body.modifiers);
    }

    return jsonResponse({ modifier_group: data }, 201);
  }
}

// ─── Full Menu (for POS / Customer display) ─────────────────────────────────

async function getFullMenu(supabase: any, auth: AuthContext, branchId: string) {
  const { data: categories, error: catError } = await supabase
    .from('menu_categories')
    .select('*')
    .eq('branch_id', branchId)
    .eq('is_active', true)
    .order('sort_order', { ascending: true });

  if (catError) return errorResponse(catError.message);

  const { data: items, error: itemError } = await supabase
    .from('menu_items')
    .select('*, menu_variants(*), menu_item_modifier_groups(*, modifier_groups(*, modifiers(*))), menu_item_ingredients(*), menu_item_extras(*)')
    .eq('branch_id', branchId)
    .eq('is_active', true)
    .order('sort_order', { ascending: true });

  if (itemError) return errorResponse(itemError.message);

  // Get available meals for availability badges
  const { data: availableMeals } = await supabase
    .from('available_meals')
    .select('menu_item_id, quantity_available')
    .eq('branch_id', branchId)
    .gt('quantity_available', 0);

  const mealsMap = new Map((availableMeals ?? []).map((m: any) => [m.menu_item_id, m.quantity_available]));

  // Group items by category
  const menu = (categories ?? []).map((cat: any) => ({
    ...cat,
    items: (items ?? [])
      .filter((item: any) => item.category_id === cat.id)
      .map((item: any) => ({
        ...item,
        available_quantity: mealsMap.get(item.id) ?? 0,
      })),
  }));

  return jsonResponse({ menu });
}

// ─── Public Menu (unauthenticated, for customer app) ───────────────────

async function getPublicMenu(req: Request, supabase: any) {
  const url = new URL(req.url);
  const branchId = url.searchParams.get('branch_id');
  const companySlug = url.searchParams.get('company_slug');

  if (!branchId && !companySlug) {
    return errorResponse('Missing branch_id or company_slug');
  }

  // Resolve branch_id from company slug if needed
  let resolvedBranchId = branchId;
  if (!resolvedBranchId && companySlug) {
    const { data: company } = await supabase
      .from('companies')
      .select('id')
      .eq('slug', companySlug)
      .single();
    if (!company) return errorResponse('Company not found', 404);

    const { data: branch } = await supabase
      .from('branches')
      .select('id')
      .eq('company_id', company.id)
      .eq('is_active', true)
      .limit(1)
      .single();
    if (!branch) return errorResponse('No active branch found', 404);
    resolvedBranchId = branch.id;
  }

  const { data: categories, error: catError } = await supabase
    .from('menu_categories')
    .select('id, name, description, image_url, sort_order')
    .eq('branch_id', resolvedBranchId)
    .eq('is_active', true)
    .order('sort_order', { ascending: true });

  if (catError) return errorResponse(catError.message);

  const { data: items, error: itemError } = await supabase
    .from('menu_items')
    .select(`
      id, name, description, base_price, image_url, media_url, media_type,
      availability_status, preparation_time_min, station, tags, allergens, calories,
      category_id,
      menu_variants(id, name, price_adjustment, is_active),
      menu_item_modifier_groups(modifier_groups(id, name, min_selections, max_selections, is_required, modifiers(id, name, price, is_active))),
      menu_item_ingredients(id, ingredient_id, name, cost_contribution, quantity_used, unit),
      menu_item_extras(id, name, price, is_available, sort_order)
    `)
    .eq('branch_id', resolvedBranchId)
    .eq('is_active', true)
    .eq('is_available', true)
    .order('sort_order', { ascending: true });

  if (itemError) return errorResponse(itemError.message);

  // Get available meals
  const { data: availableMeals } = await supabase
    .from('available_meals')
    .select('menu_item_id, quantity_available')
    .eq('branch_id', resolvedBranchId)
    .gt('quantity_available', 0);

  const mealsMap = new Map((availableMeals ?? []).map((m: any) => [m.menu_item_id, m.quantity_available]));

  const menu = (categories ?? []).map((cat: any) => ({
    ...cat,
    items: (items ?? [])
      .filter((item: any) => item.category_id === cat.id)
      .map((item: any) => ({
        ...item,
        available_quantity: mealsMap.get(item.id) ?? 0,
      })),
  }));

  return jsonResponse({ menu });
}

// ─── Helpers ────────────────────────────────────────────────────────────────

async function syncIngredients(supabase: any, menuItemId: string, ingredients: any[]) {
  await supabase.from('menu_item_ingredients').delete().eq('menu_item_id', menuItemId);

  if (ingredients.length === 0) return;

  const records = ingredients.map((ing: any) => ({
    menu_item_id: menuItemId,
    ingredient_id: ing.ingredient_id,
    variant_id: ing.variant_id ?? null,
    name: ing.name ?? null,
    quantity_used: ing.quantity_used,
    unit: ing.unit,
    cost_contribution: ing.cost_contribution ?? 0,
  }));

  await supabase.from('menu_item_ingredients').insert(records);
}

async function syncExtras(supabase: any, menuItemId: string, extras: any[]) {
  await supabase.from('menu_item_extras').delete().eq('menu_item_id', menuItemId);

  if (extras.length === 0) return;

  const records = extras.map((ext: any, i: number) => ({
    menu_item_id: menuItemId,
    name: sanitizeString(ext.name),
    price: ext.price ?? 0,
    is_available: ext.is_available ?? true,
    sort_order: ext.sort_order ?? i,
  }));

  await supabase.from('menu_item_extras').insert(records);
}

async function syncModifiers(supabase: any, groupId: string, modifiers: any[]) {
  await supabase.from('modifiers').delete().eq('modifier_group_id', groupId);

  if (modifiers.length === 0) return;

  const records = modifiers.map((mod: any, i: number) => ({
    modifier_group_id: groupId,
    name: sanitizeString(mod.name),
    price: mod.price ?? 0,
    is_available: mod.is_available ?? true,
    sort_order: mod.sort_order ?? i,
  }));

  await supabase.from('modifiers').insert(records);
}
