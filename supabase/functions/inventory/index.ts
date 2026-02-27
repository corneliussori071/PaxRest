import { serve } from 'https://deno.land/std@0.208.0/http/server.ts';
import {
  corsResponse, jsonResponse, errorResponse,
  createUserClient, createServiceClient, requireAuth, hasPermission, resolveBranchId,
  validatePagination, applyPagination, sanitizeString,
} from '../_shared/index.ts';
import type { AuthContext } from '../_shared/index.ts';

serve(async (req) => {
  if (req.method === 'OPTIONS') return corsResponse();

  const url = new URL(req.url);
  const action = url.pathname.split('/').filter(Boolean).pop();

  try {
    const supabase = createUserClient(req);
    const authResult = await requireAuth(supabase, req);
    if (authResult instanceof Response) return authResult;
    const auth = authResult as AuthContext;
    const branchId = resolveBranchId(auth, req);
    if (!branchId) return errorResponse('No branch context');

    switch (action) {
      case 'items':
        return req.method === 'GET'
          ? await listItems(req, supabase, auth, branchId)
          : await upsertItem(req, supabase, auth, branchId);
      case 'item':
        if (req.method === 'GET') return await getItem(req, supabase, auth, branchId);
        if (req.method === 'DELETE') return await deactivateItem(req, supabase, auth, branchId);
        return errorResponse('Method not allowed', 405);
      case 'barcode-lookup':
        return await barcodeLookup(req, supabase, auth, branchId);
      case 'csv-import':
        return await csvImport(req, supabase, auth, branchId);
      case 'adjust':
        return await adjustStock(req, supabase, auth, branchId);
      case 'movements':
        return await listMovements(req, supabase, auth, branchId);
      case 'wastage':
        return req.method === 'GET'
          ? await listWastage(req, supabase, auth, branchId)
          : await recordWastage(req, supabase, auth, branchId);
      case 'transfer':
        return await createTransfer(req, supabase, auth, branchId);
      case 'transfers':
        return await listTransfers(req, supabase, auth, branchId);
      case 'low-stock':
        return await getLowStock(req, supabase, auth, branchId);
      case 'ingredient-requests':
        return req.method === 'GET'
          ? await listIngredientRequests(req, supabase, auth, branchId)
          : await createIngredientRequest(req, supabase, auth, branchId);
      case 'ingredient-request-respond':
        return await respondIngredientRequest(req, supabase, auth, branchId);
      case 'ingredient-request-disburse':
        return await disburseIngredientRequest(req, supabase, auth, branchId);
      case 'ingredient-request-receive':
        return await receiveIngredientRequest(req, supabase, auth, branchId);
      case 'ingredient-request-return':
        return await returnIngredientRequest(req, supabase, auth, branchId);
      case 'ingredient-request-accept-return':
        return await acceptReturnIngredientRequest(req, supabase, auth, branchId);
      case 'ingredient-request-reject-return':
        return await rejectReturnIngredientRequest(req, supabase, auth, branchId);
      case 'ingredient-request-update':
        return await updateIngredientRequest(req, supabase, auth, branchId);
      case 'ingredient-request-delete':
        return await deleteIngredientRequest(req, supabase, auth, branchId);
      default:
        return errorResponse('Unknown inventory action', 404);
    }
  } catch (err) {
    console.error('Inventory error:', err);
    return errorResponse(err.message ?? 'Internal server error', 500);
  }
});

// ─── List Items (paginated) ─────────────────────────────────────────────────

async function listItems(req: Request, supabase: any, auth: AuthContext, branchId: string) {
  const url = new URL(req.url);
  const { page, pageSize, sortColumn, sortDirection } = validatePagination(
    {
      page: Number(url.searchParams.get('page')),
      page_size: Number(url.searchParams.get('page_size')),
      sort_column: url.searchParams.get('sort_column') ?? undefined,
      sort_direction: url.searchParams.get('sort_direction') ?? undefined,
    },
    ['created_at', 'name', 'quantity', 'cost_per_unit', 'category', 'barcode'],
  );

  let query = supabase
    .from('inventory_items')
    .select('*', { count: 'exact' })
    .eq('branch_id', branchId);

  const category = url.searchParams.get('category');
  if (category) query = query.eq('category', category);

  const search = url.searchParams.get('search');
  if (search) query = query.or(`name.ilike.%${search}%,sku.ilike.%${search}%,barcode.ilike.%${search}%`);

  const activeOnly = url.searchParams.get('active_only');
  if (activeOnly === 'true') query = query.eq('is_active', true);

  query = applyPagination(query, page, pageSize, sortColumn, sortDirection === 'ASC');
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

// ─── Get Single Item ────────────────────────────────────────────────────────

async function getItem(req: Request, supabase: any, auth: AuthContext, branchId: string) {
  const url = new URL(req.url);
  const id = url.searchParams.get('id');
  if (!id) return errorResponse('Missing item id');

  const { data, error } = await supabase
    .from('inventory_items')
    .select('*')
    .eq('id', id)
    .eq('branch_id', branchId)
    .single();

  if (error) return errorResponse(error.message, 404);
  return jsonResponse({ item: data });
}

// ─── Barcode Lookup ─────────────────────────────────────────────────────────

async function barcodeLookup(req: Request, supabase: any, auth: AuthContext, branchId: string) {
  const url = new URL(req.url);
  const barcode = url.searchParams.get('barcode');
  if (!barcode) return errorResponse('Missing barcode');

  const { data, error } = await supabase
    .from('inventory_items')
    .select('*')
    .eq('branch_id', branchId)
    .eq('barcode', barcode)
    .maybeSingle();

  if (error) return errorResponse(error.message);
  return jsonResponse({ item: data }); // null if not found — not an error
}

// ─── Upsert Item ────────────────────────────────────────────────────────────

async function upsertItem(req: Request, supabase: any, auth: AuthContext, branchId: string) {
  if (!hasPermission(auth, 'manage_inventory')) return errorResponse('Forbidden', 403);
  const body = await req.json();

  if (!body.name || !body.unit) return errorResponse('Missing name or unit');

  const packagingType = body.packaging_type ?? 'single';
  const itemsPerPack = packagingType === 'pack' ? (body.items_per_pack ?? 1) : 1;
  const costPerUnit = body.cost_per_unit ?? 0;
  const costPerItem = packagingType === 'pack' && itemsPerPack > 0
    ? Number((costPerUnit / itemsPerPack).toFixed(4))
    : costPerUnit;

  const record: Record<string, any> = {
    company_id: auth.companyId,
    branch_id: branchId,
    name: sanitizeString(body.name),
    sku: body.sku ? sanitizeString(body.sku) : null,
    barcode: body.barcode ? sanitizeString(body.barcode) : null,
    unit: body.unit,
    quantity: body.quantity ?? 0,
    min_stock_level: body.min_stock_level ?? 0,
    cost_per_unit: costPerUnit,
    selling_price: body.selling_price ?? 0,
    packaging_type: packagingType,
    items_per_pack: itemsPerPack,
    cost_per_item: costPerItem,
    weight_value: body.weight_value ?? null,
    weight_unit: body.weight_unit ?? null,
    category: body.category ?? null,
    storage_location: body.storage_location ?? null,
    image_url: body.image_url ?? null,
    is_active: body.is_active ?? true,
  };

  if (body.id) {
    const { data, error } = await supabase
      .from('inventory_items')
      .update(record)
      .eq('id', body.id)
      .eq('branch_id', branchId)
      .select()
      .single();
    if (error) return errorResponse(error.message);
    return jsonResponse({ item: data });
  } else {
    // If we're creating, also record an opening stock movement
    const { data, error } = await supabase
      .from('inventory_items')
      .insert(record)
      .select()
      .single();
    if (error) return errorResponse(error.message);

    // Record opening stock movement
    if (record.quantity > 0) {
      await supabase.from('stock_movements').insert({
        company_id: auth.companyId,
        branch_id: branchId,
        inventory_item_id: data.id,
        movement_type: 'opening_stock',
        quantity_change: record.quantity,
        quantity_before: 0,
        quantity_after: record.quantity,
        unit_cost: costPerUnit,
        reference_type: 'initial',
        notes: 'Opening stock',
        performed_by: auth.userId,
        performed_by_name: body.performed_by_name ?? auth.email,
      });
    }

    return jsonResponse({ item: data }, 201);
  }
}

// ─── CSV Import ─────────────────────────────────────────────────────────────

async function csvImport(req: Request, supabase: any, auth: AuthContext, branchId: string) {
  if (req.method !== 'POST') return errorResponse('Method not allowed', 405);
  if (!hasPermission(auth, 'manage_inventory')) return errorResponse('Forbidden', 403);

  const body = await req.json();
  const rows = body.rows; // Array of parsed CSV rows from frontend
  if (!Array.isArray(rows) || rows.length === 0) {
    return errorResponse('No rows provided');
  }

  if (rows.length > 500) {
    return errorResponse('Maximum 500 items per CSV import');
  }

  const results = { created: 0, updated: 0, errors: [] as string[] };

  for (const row of rows) {
    try {
      if (!row.name || !row.unit) {
        results.errors.push(`Skipped row: missing name or unit (${row.name ?? 'unnamed'})`);
        continue;
      }

      const packagingType = row.packaging_type ?? 'single';
      const itemsPerPack = packagingType === 'pack' ? (row.items_per_pack ?? 1) : 1;
      const costPerUnit = row.cost_per_unit ?? 0;

      const record: Record<string, any> = {
        company_id: auth.companyId,
        branch_id: branchId,
        name: sanitizeString(row.name),
        barcode: row.barcode ? sanitizeString(row.barcode) : null,
        unit: row.unit,
        quantity: row.quantity ?? 0,
        min_stock_level: row.min_stock_level ?? 0,
        cost_per_unit: costPerUnit,
        selling_price: row.selling_price ?? 0,
        packaging_type: packagingType,
        items_per_pack: itemsPerPack,
        cost_per_item: packagingType === 'pack' && itemsPerPack > 0
          ? Number((costPerUnit / itemsPerPack).toFixed(4))
          : costPerUnit,
        category: row.category ?? null,
        is_active: true,
      };

      // Check for existing item by barcode
      let existingItem = null;
      if (row.barcode) {
        const { data } = await supabase
          .from('inventory_items')
          .select('id, quantity')
          .eq('branch_id', branchId)
          .eq('barcode', row.barcode)
          .maybeSingle();
        existingItem = data;
      }

      if (existingItem) {
        // Update existing item
        const { error } = await supabase
          .from('inventory_items')
          .update(record)
          .eq('id', existingItem.id);
        if (error) {
          results.errors.push(`Error updating ${row.name}: ${error.message}`);
        } else {
          results.updated++;
        }
      } else {
        // Insert new item
        const { data: newItem, error } = await supabase
          .from('inventory_items')
          .insert(record)
          .select('id')
          .single();

        if (error) {
          results.errors.push(`Error creating ${row.name}: ${error.message}`);
        } else {
          results.created++;

          // Record opening stock
          if (record.quantity > 0) {
            await supabase.from('stock_movements').insert({
              company_id: auth.companyId,
              branch_id: branchId,
              inventory_item_id: newItem.id,
              movement_type: 'opening_stock',
              quantity_change: record.quantity,
              quantity_before: 0,
              quantity_after: record.quantity,
              unit_cost: costPerUnit,
              reference_type: 'csv_import',
              notes: 'CSV import',
              performed_by: auth.userId,
              performed_by_name: body.performed_by_name ?? auth.email,
            });
          }
        }
      }
    } catch (e) {
      results.errors.push(`Error processing row: ${e.message}`);
    }
  }

  return jsonResponse(results, 201);
}

// ─── Deactivate Item ────────────────────────────────────────────────────────

async function deactivateItem(req: Request, supabase: any, auth: AuthContext, branchId: string) {
  if (!hasPermission(auth, 'manage_inventory')) return errorResponse('Forbidden', 403);
  const url = new URL(req.url);
  const id = url.searchParams.get('id');
  if (!id) return errorResponse('Missing item id');

  const { error } = await supabase
    .from('inventory_items')
    .update({ is_active: false })
    .eq('id', id)
    .eq('branch_id', branchId);

  if (error) return errorResponse(error.message);
  return jsonResponse({ deactivated: true });
}

// ─── Adjust Stock ───────────────────────────────────────────────────────────

async function adjustStock(req: Request, supabase: any, auth: AuthContext, branchId: string) {
  if (req.method !== 'POST') return errorResponse('Method not allowed', 405);
  if (!hasPermission(auth, 'manage_inventory')) return errorResponse('Forbidden', 403);

  const body = await req.json();
  if (!body.inventory_item_id || body.quantity_change === undefined || !body.reason) {
    return errorResponse('Missing inventory_item_id, quantity_change, or reason');
  }

  const { data: item } = await supabase
    .from('inventory_items')
    .select('quantity, cost_per_unit')
    .eq('id', body.inventory_item_id)
    .eq('branch_id', branchId)
    .single();

  if (!item) return errorResponse('Item not found', 404);

  const newQty = item.quantity + body.quantity_change;
  if (newQty < 0) return errorResponse('Adjustment would result in negative stock');

  const { error: updateError } = await supabase
    .from('inventory_items')
    .update({ quantity: newQty })
    .eq('id', body.inventory_item_id);

  if (updateError) return errorResponse(updateError.message);

  const { error: movError } = await supabase
    .from('stock_movements')
    .insert({
      company_id: auth.companyId,
      branch_id: branchId,
      inventory_item_id: body.inventory_item_id,
      movement_type: 'adjustment',
      quantity_change: body.quantity_change,
      quantity_before: item.quantity,
      quantity_after: newQty,
      unit_cost: item.cost_per_unit,
      reference_type: 'adjustment',
      notes: sanitizeString(body.reason),
      performed_by: auth.userId,
      performed_by_name: body.performed_by_name ?? auth.email,
    });

  if (movError) return errorResponse(movError.message);
  return jsonResponse({ new_quantity: newQty });
}

// ─── List Movements (paginated) ─────────────────────────────────────────────

async function listMovements(req: Request, supabase: any, auth: AuthContext, branchId: string) {
  const url = new URL(req.url);
  const { page, pageSize } = validatePagination({
    page: Number(url.searchParams.get('page')),
    page_size: Number(url.searchParams.get('page_size')),
  });

  let query = supabase
    .from('stock_movements')
    .select('*, inventory_items(name, sku, barcode)', { count: 'exact' })
    .eq('branch_id', branchId);

  const itemId = url.searchParams.get('inventory_item_id');
  if (itemId) query = query.eq('inventory_item_id', itemId);

  const movementType = url.searchParams.get('movement_type');
  if (movementType) query = query.eq('movement_type', movementType);

  query = applyPagination(query, page, pageSize, 'created_at', false);
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

// ─── List Wastage (paginated) ───────────────────────────────────────────────

async function listWastage(req: Request, supabase: any, auth: AuthContext, branchId: string) {
  const url = new URL(req.url);
  const { page, pageSize } = validatePagination({
    page: Number(url.searchParams.get('page')),
    page_size: Number(url.searchParams.get('page_size')),
  });

  let query = supabase
    .from('wastage_records')
    .select('*', { count: 'exact' })
    .eq('branch_id', branchId);

  query = applyPagination(query, page, pageSize, 'created_at', false);
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

// ─── Record Wastage ─────────────────────────────────────────────────────────

async function recordWastage(req: Request, supabase: any, auth: AuthContext, branchId: string) {
  if (!hasPermission(auth, 'manage_wastage')) return errorResponse('Forbidden', 403);
  const body = await req.json();

  if (!body.inventory_item_id || !body.quantity || !body.reason || !body.wastage_type) {
    return errorResponse('Missing inventory_item_id, quantity, reason, or wastage_type');
  }

  const { data, error } = await supabase.rpc('record_wastage', {
    p_company_id: auth.companyId,
    p_branch_id: branchId,
    p_inventory_item_id: body.inventory_item_id,
    p_quantity: body.quantity,
    p_reason: sanitizeString(body.reason),
    p_wastage_type: body.wastage_type,
    p_recorded_by: auth.userId,
    p_recorded_by_name: body.recorded_by_name ?? auth.email,
    p_notes: body.notes ? sanitizeString(body.notes) : null,
    p_image_url: body.image_url ?? null,
  });

  if (error) return errorResponse(error.message, 400);
  return jsonResponse(data, 201);
}

// ─── Create Transfer ────────────────────────────────────────────────────────

async function createTransfer(req: Request, supabase: any, auth: AuthContext, branchId: string) {
  if (req.method !== 'POST') return errorResponse('Method not allowed', 405);
  if (!hasPermission(auth, 'manage_inventory')) return errorResponse('Forbidden', 403);
  const body = await req.json();

  if (!body.to_branch_id || !body.items || body.items.length === 0) {
    return errorResponse('Missing to_branch_id or items');
  }

  const { data: transfer, error } = await supabase
    .from('inventory_transfers')
    .insert({
      company_id: auth.companyId,
      from_branch_id: branchId,
      from_branch_name: body.from_branch_name ?? '',
      to_branch_id: body.to_branch_id,
      to_branch_name: body.to_branch_name ?? '',
      status: 'pending',
      notes: body.notes ?? null,
      initiated_by: auth.userId,
      initiated_by_name: body.initiated_by_name ?? auth.email,
    })
    .select()
    .single();

  if (error) return errorResponse(error.message);

  const transferItems = body.items.map((item: any) => ({
    transfer_id: transfer.id,
    inventory_item_id: item.inventory_item_id,
    inventory_item_name: item.inventory_item_name ?? '',
    quantity: item.quantity,
    unit: item.unit ?? 'pcs',
    unit_cost: item.unit_cost ?? 0,
  }));

  await supabase.from('inventory_transfer_items').insert(transferItems);
  return jsonResponse({ transfer }, 201);
}

// ─── List Transfers (paginated) ─────────────────────────────────────────────

async function listTransfers(req: Request, supabase: any, auth: AuthContext, branchId: string) {
  const url = new URL(req.url);
  const { page, pageSize } = validatePagination({
    page: Number(url.searchParams.get('page')),
    page_size: Number(url.searchParams.get('page_size')),
  });

  let query = supabase
    .from('inventory_transfers')
    .select('*, inventory_transfer_items(*)', { count: 'exact' })
    .or(`from_branch_id.eq.${branchId},to_branch_id.eq.${branchId}`);

  query = applyPagination(query, page, pageSize, 'created_at', false);
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

// ─── Low Stock (SQL-level filtering) ────────────────────────────────────────

async function getLowStock(req: Request, supabase: any, auth: AuthContext, branchId: string) {
  const url = new URL(req.url);
  const { page, pageSize } = validatePagination({
    page: Number(url.searchParams.get('page')),
    page_size: Number(url.searchParams.get('page_size')),
  });

  // Use raw SQL via RPC or filter properly
  const { data, count, error } = await supabase
    .from('inventory_items')
    .select('*', { count: 'exact' })
    .eq('branch_id', branchId)
    .eq('is_active', true)
    .or('quantity.lte.min_stock_level')
    .order('quantity', { ascending: true })
    .range((page - 1) * pageSize, page * pageSize - 1);

  if (error) {
    // Fallback: fetch all and filter in JS
    const { data: all, error: allErr } = await supabase
      .from('inventory_items')
      .select('*')
      .eq('branch_id', branchId)
      .eq('is_active', true)
      .order('quantity', { ascending: true });

    if (allErr) return errorResponse(allErr.message);

    const lowStock = (all ?? []).filter((item: any) => item.quantity <= item.min_stock_level);
    const paginated = lowStock.slice((page - 1) * pageSize, page * pageSize);

    return jsonResponse({
      items: paginated,
      total: lowStock.length,
      page,
      page_size: pageSize,
      total_pages: Math.ceil(lowStock.length / pageSize),
    });
  }

  return jsonResponse({
    items: data,
    total: count,
    page,
    page_size: pageSize,
    total_pages: Math.ceil((count ?? 0) / pageSize),
  });
}

// ─── List Ingredient Requests ───────────────────────────────────────────────

async function listIngredientRequests(req: Request, supabase: any, auth: AuthContext, branchId: string) {
  const url = new URL(req.url);
  const { page, pageSize } = validatePagination({
    page: Number(url.searchParams.get('page')),
    page_size: Number(url.searchParams.get('page_size')),
  });

  const status = url.searchParams.get('status');
  const dateRange = url.searchParams.get('date_range'); // 'today','7d','30d','all'

  const station = url.searchParams.get('station'); // 'kitchen','bar','shisha'

  let query = supabase
    .from('ingredient_requests')
    .select('*, ingredient_request_items(*, inventory_items(name, unit, quantity))', { count: 'exact' })
    .eq('branch_id', branchId);

  // Filter by station/department so each internal store only sees its own requests
  if (station) {
    query = query.eq('station', station);
  }

  if (status) {
    // Support comma-separated statuses for multi-tab filtering
    const statuses = status.split(',');
    if (statuses.length === 1) query = query.eq('status', statuses[0]);
    else query = query.in('status', statuses);
  }

  // Date range filtering
  if (dateRange && dateRange !== 'all') {
    const now = new Date();
    let since: Date;
    if (dateRange === 'today') {
      since = new Date(now.getFullYear(), now.getMonth(), now.getDate());
    } else if (dateRange === '7d') {
      since = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
    } else if (dateRange === '30d') {
      since = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);
    } else {
      since = new Date(0);
    }
    query = query.gte('created_at', since.toISOString());
  }

  query = applyPagination(query, page, pageSize, 'created_at', false);
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

// ─── Create Ingredient Request ──────────────────────────────────────────────

async function createIngredientRequest(req: Request, supabase: any, auth: AuthContext, branchId: string) {
  if (!hasPermission(auth, 'kitchen_ingredient_requests') && !hasPermission(auth, 'view_kitchen') && !hasPermission(auth, 'manage_inventory')) {
    return errorResponse('Forbidden', 403);
  }
  const body = await req.json();

  if (!body.items || body.items.length === 0) {
    return errorResponse('No items in request');
  }

  // Use auth name (profile name), not email
  const requesterName = auth.name ?? auth.email;

  const { data: request, error } = await supabase
    .from('ingredient_requests')
    .insert({
      company_id: auth.companyId,
      branch_id: branchId,
      requested_by: auth.userId,
      requested_by_name: sanitizeString(requesterName),
      status: 'pending',
      notes: body.notes ? sanitizeString(body.notes) : null,
      station: body.station ?? 'kitchen',
    })
    .select()
    .single();

  if (error) return errorResponse(error.message);

  // Resolve item names from inventory_items
  const itemIds = body.items.map((i: any) => i.inventory_item_id);
  const { data: invItems } = await supabase
    .from('inventory_items')
    .select('id, name, unit')
    .in('id', itemIds);
  const nameMap: Record<string, { name: string; unit: string }> = {};
  (invItems ?? []).forEach((i: any) => { nameMap[i.id] = { name: i.name, unit: i.unit }; });

  const items = body.items.map((item: any) => ({
    request_id: request.id,
    inventory_item_id: item.inventory_item_id,
    inventory_item_name: nameMap[item.inventory_item_id]?.name ?? item.inventory_item_name ?? '',
    quantity_requested: item.quantity_requested,
    unit: nameMap[item.inventory_item_id]?.unit ?? item.unit ?? 'pcs',
  }));

  const { error: itemsError } = await supabase
    .from('ingredient_request_items')
    .insert(items);

  if (itemsError) return errorResponse(itemsError.message);
  return jsonResponse({ request }, 201);
}

// ─── Update Ingredient Request (edit, kitchen side) ─────────────────────────

async function updateIngredientRequest(req: Request, supabase: any, auth: AuthContext, branchId: string) {
  if (req.method !== 'POST') return errorResponse('Method not allowed', 405);
  const body = await req.json();
  if (!body.request_id) return errorResponse('Missing request_id');

  const service = createServiceClient();

  // Only pending requests can be edited
  const { data: existing } = await service
    .from('ingredient_requests')
    .select('status, requested_by')
    .eq('id', body.request_id)
    .eq('branch_id', branchId)
    .single();
  if (!existing) return errorResponse('Request not found', 404);
  if (existing.status !== 'pending') return errorResponse('Only pending requests can be edited', 400);

  // Only the requester or privileged users can edit
  const isOwner = existing.requested_by === auth.userId;
  const isPrivileged = hasPermission(auth, 'manage_inventory') || hasPermission(auth, 'kitchen_ingredient_requests');
  if (!isOwner && !isPrivileged) return errorResponse('Forbidden', 403);

  const updates: Record<string, unknown> = {};
  if (body.notes !== undefined) updates.notes = body.notes ? sanitizeString(body.notes) : null;
  if (Object.keys(updates).length > 0) {
    await service.from('ingredient_requests').update(updates).eq('id', body.request_id);
  }

  // Update items if provided
  if (body.items) {
    // Delete existing items and re-insert
    await service.from('ingredient_request_items').delete().eq('request_id', body.request_id);

    const itemIds = body.items.map((i: any) => i.inventory_item_id);
    const { data: invItems } = await service.from('inventory_items').select('id, name, unit').in('id', itemIds);
    const nameMap: Record<string, { name: string; unit: string }> = {};
    (invItems ?? []).forEach((i: any) => { nameMap[i.id] = { name: i.name, unit: i.unit }; });

    const items = body.items.map((item: any) => ({
      request_id: body.request_id,
      inventory_item_id: item.inventory_item_id,
      inventory_item_name: nameMap[item.inventory_item_id]?.name ?? '',
      quantity_requested: item.quantity_requested,
      unit: nameMap[item.inventory_item_id]?.unit ?? item.unit ?? 'pcs',
    }));
    await service.from('ingredient_request_items').insert(items);
  }

  return jsonResponse({ updated: true });
}

// ─── Delete Ingredient Request ──────────────────────────────────────────────

async function deleteIngredientRequest(req: Request, supabase: any, auth: AuthContext, branchId: string) {
  if (req.method !== 'POST') return errorResponse('Method not allowed', 405);
  const body = await req.json();
  if (!body.request_id) return errorResponse('Missing request_id');

  const service = createServiceClient();

  const { data: existing } = await service
    .from('ingredient_requests')
    .select('status, requested_by')
    .eq('id', body.request_id)
    .eq('branch_id', branchId)
    .single();
  if (!existing) return errorResponse('Request not found', 404);
  if (existing.status !== 'pending') return errorResponse('Only pending requests can be deleted', 400);

  const isOwner = existing.requested_by === auth.userId;
  const isPrivileged = hasPermission(auth, 'manage_inventory') || hasPermission(auth, 'kitchen_ingredient_requests');
  if (!isOwner && !isPrivileged) return errorResponse('Forbidden', 403);

  await service.from('ingredient_request_items').delete().eq('request_id', body.request_id);
  await service.from('ingredient_requests').delete().eq('id', body.request_id);

  return jsonResponse({ deleted: true });
}

// ─── Respond to Ingredient Request (approve/reject from Inventory) ──────────

async function respondIngredientRequest(req: Request, supabase: any, auth: AuthContext, branchId: string) {
  if (req.method !== 'POST') return errorResponse('Method not allowed', 405);
  if (!hasPermission(auth, 'manage_inventory')) return errorResponse('Forbidden', 403);

  const body = await req.json();
  if (!body.request_id || !body.status) {
    return errorResponse('Missing request_id or status');
  }

  if (!['approved', 'rejected', 'cancelled'].includes(body.status)) {
    return errorResponse('Invalid status. Use: approved, rejected, cancelled');
  }

  const service = createServiceClient();

  const updates: Record<string, unknown> = {
    status: body.status,
    approved_by: auth.userId,
    approved_by_name: auth.name ?? auth.email,
    responded_at: new Date().toISOString(),
  };
  if (body.response_notes) updates.response_notes = sanitizeString(body.response_notes);

  const { error } = await service
    .from('ingredient_requests')
    .update(updates)
    .eq('id', body.request_id)
    .eq('branch_id', branchId);

  if (error) return errorResponse(error.message);
  return jsonResponse({ updated: true, status: body.status });
}

// ─── Disburse Ingredient Request (inventory deducts stock & marks in_transit) ─

async function disburseIngredientRequest(req: Request, supabase: any, auth: AuthContext, branchId: string) {
  if (req.method !== 'POST') return errorResponse('Method not allowed', 405);
  if (!hasPermission(auth, 'manage_inventory')) return errorResponse('Forbidden', 403);

  const body = await req.json();
  if (!body.request_id) return errorResponse('Missing request_id');
  if (!body.items || body.items.length === 0) return errorResponse('Missing items with disbursement quantities');

  const service = createServiceClient();

  // Verify request exists and is approved
  const { data: request } = await service
    .from('ingredient_requests')
    .select('status, station')
    .eq('id', body.request_id)
    .eq('branch_id', branchId)
    .single();
  if (!request) return errorResponse('Request not found', 404);
  if (request.status !== 'approved') return errorResponse('Only approved requests can be disbursed', 400);

  const department = request.station ?? 'kitchen';

  // Process each item: update disbursed quantity, deduct from inventory, log movement
  for (const item of body.items) {
    if (!item.id || item.quantity_disbursed == null) continue;

    // Get the request item details
    const { data: reqItem } = await service
      .from('ingredient_request_items')
      .select('inventory_item_id, quantity_requested')
      .eq('id', item.id)
      .single();
    if (!reqItem) continue;

    // Update request item with disbursed quantity
    await service
      .from('ingredient_request_items')
      .update({
        quantity_disbursed: item.quantity_disbursed,
        disbursement_notes: item.disbursement_notes ? sanitizeString(item.disbursement_notes) : null,
      })
      .eq('id', item.id);

    // Deduct from inventory
    const { data: invItem } = await service
      .from('inventory_items')
      .select('id, quantity')
      .eq('id', reqItem.inventory_item_id)
      .single();
    if (!invItem) continue;

    const qtyBefore = Number(invItem.quantity);
    const qtyAfter = Math.max(0, qtyBefore - Number(item.quantity_disbursed));

    await service
      .from('inventory_items')
      .update({ quantity: qtyAfter })
      .eq('id', invItem.id);

    // Log stock movement
    await service
      .from('stock_movements')
      .insert({
        company_id: auth.companyId,
        branch_id: branchId,
        inventory_item_id: invItem.id,
        movement_type: `${department}_request`,
        quantity_change: -Number(item.quantity_disbursed),
        quantity_before: qtyBefore,
        quantity_after: qtyAfter,
        unit_cost: 0,
        reference_type: 'ingredient_request',
        reference_id: body.request_id,
        notes: `Disbursed for ${department} request`,
        performed_by: auth.userId,
        performed_by_name: auth.name ?? auth.email,
      });
  }

  // Update request status to in_transit
  await service
    .from('ingredient_requests')
    .update({
      status: 'in_transit',
      disbursed_at: new Date().toISOString(),
    })
    .eq('id', body.request_id);

  return jsonResponse({ disbursed: true });
}

// ─── Receive Ingredient Request (kitchen confirms receipt with actual quantities) ─

async function receiveIngredientRequest(req: Request, supabase: any, auth: AuthContext, branchId: string) {
  if (req.method !== 'POST') return errorResponse('Method not allowed', 405);

  const body = await req.json();
  if (!body.request_id) return errorResponse('Missing request_id');

  const service = createServiceClient();

  const { data: request } = await service
    .from('ingredient_requests')
    .select('status, station')
    .eq('id', body.request_id)
    .eq('branch_id', branchId)
    .single();
  if (!request) return errorResponse('Request not found', 404);
  if (request.status !== 'in_transit' && request.status !== 'disbursed') {
    return errorResponse('Only in-transit or disbursed requests can be received', 400);
  }

  const department = request.station ?? 'kitchen';

  // Update quantity_received per item if provided
  if (body.items && Array.isArray(body.items)) {
    for (const item of body.items) {
      if (!item.id || item.quantity_received == null) continue;
      await service
        .from('ingredient_request_items')
        .update({ quantity_received: Number(item.quantity_received) })
        .eq('id', item.id);
    }
  }

  await service
    .from('ingredient_requests')
    .update({
      status: 'received',
      received_at: new Date().toISOString(),
    })
    .eq('id', body.request_id);

  // ── Auto-stock Internal Store based on department ────────────────────────
  // Fetch all items with their actual received (or disbursed) quantities
  const { data: receivedItems } = await service
    .from('ingredient_request_items')
    .select('inventory_item_id, inventory_item_name, unit, quantity_received, quantity_disbursed, quantity_requested')
    .eq('request_id', body.request_id);

  // Determine which store tables to use based on department
  const storeTable = department === 'bar' ? 'bar_store_items' : 'kitchen_store_items';
  const movementTable = department === 'bar' ? 'bar_store_movements' : 'kitchen_store_movements';
  const storeFk = department === 'bar' ? 'bar_store_item_id' : 'kitchen_store_item_id';

  for (const item of (receivedItems ?? [])) {
    const qty = Number(item.quantity_received ?? item.quantity_disbursed ?? item.quantity_requested ?? 0);
    if (qty <= 0) continue;

    // Upsert internal store item
    const { data: existing } = await service
      .from(storeTable)
      .select('id, quantity')
      .eq('branch_id', branchId)
      .eq('inventory_item_id', item.inventory_item_id)
      .maybeSingle();

    let storeItemId: string;
    let qtyBefore: number;
    let qtyAfter: number;

    if (existing) {
      qtyBefore = Number(existing.quantity);
      qtyAfter = qtyBefore + qty;
      storeItemId = existing.id;
      await service
        .from(storeTable)
        .update({ quantity: qtyAfter, updated_at: new Date().toISOString() })
        .eq('id', existing.id);
    } else {
      qtyBefore = 0;
      qtyAfter = qty;
      const insertData: Record<string, unknown> = {
        company_id: auth.companyId,
        branch_id: branchId,
        inventory_item_id: item.inventory_item_id,
        item_name: item.inventory_item_name,
        unit: item.unit,
        quantity: qtyAfter,
      };
      const { data: created } = await service
        .from(storeTable)
        .insert(insertData)
        .select('id')
        .single();
      storeItemId = created?.id;
    }

    if (storeItemId) {
      await service
        .from(movementTable)
        .insert({
          company_id: auth.companyId,
          branch_id: branchId,
          [storeFk]: storeItemId,
          inventory_item_id: item.inventory_item_id,
          movement_type: 'received',
          quantity_change: qty,
          quantity_before: qtyBefore,
          quantity_after: qtyAfter,
          reference_type: 'ingredient_request',
          reference_id: body.request_id,
          notes: `Received from inventory request`,
          performed_by: auth.userId,
          performed_by_name: auth.name,
        });
    }
  }

  return jsonResponse({ received: true });
}

// ─── Return Ingredient Request (kitchen requests return → inventory must accept) ─

async function returnIngredientRequest(req: Request, supabase: any, auth: AuthContext, branchId: string) {
  if (req.method !== 'POST') return errorResponse('Method not allowed', 405);

  const body = await req.json();
  if (!body.request_id) return errorResponse('Missing request_id');

  const service = createServiceClient();

  const { data: request } = await service
    .from('ingredient_requests')
    .select('status')
    .eq('id', body.request_id)
    .eq('branch_id', branchId)
    .single();
  if (!request) return errorResponse('Request not found', 404);
  if (request.status !== 'received') {
    return errorResponse('Only received requests can be returned', 400);
  }

  // Kitchen initiates return — inventory must accept or reject it
  await service
    .from('ingredient_requests')
    .update({
      status: 'return_requested',
      return_notes: body.return_notes ? sanitizeString(body.return_notes) : null,
    })
    .eq('id', body.request_id);

  return jsonResponse({ return_requested: true });
}

// ─── Accept Return (inventory accepts return, stock is restored) ────────────

async function acceptReturnIngredientRequest(req: Request, supabase: any, auth: AuthContext, branchId: string) {
  if (req.method !== 'POST') return errorResponse('Method not allowed', 405);
  if (!hasPermission(auth, 'manage_inventory')) return errorResponse('Forbidden', 403);

  const body = await req.json();
  if (!body.request_id) return errorResponse('Missing request_id');

  const service = createServiceClient();

  const { data: request } = await service
    .from('ingredient_requests')
    .select('status, station')
    .eq('id', body.request_id)
    .eq('branch_id', branchId)
    .single();
  if (!request) return errorResponse('Request not found', 404);
  if (request.status !== 'return_requested') {
    return errorResponse('Only return-requested items can be accepted', 400);
  }

  const department = request.station ?? 'kitchen';
  const storeTable = department === 'bar' ? 'bar_store_items' : 'kitchen_store_items';
  const movementTable = department === 'bar' ? 'bar_store_movements' : 'kitchen_store_movements';
  const storeFk = department === 'bar' ? 'bar_store_item_id' : 'kitchen_store_item_id';

  // Get all disbursed items and return stock
  const { data: reqItems } = await service
    .from('ingredient_request_items')
    .select('inventory_item_id, quantity_disbursed, quantity_received')
    .eq('request_id', body.request_id);

  for (const item of (reqItems ?? [])) {
    // Return the received quantity (or disbursed qty if no received qty recorded)
    const returnQty = Number(item.quantity_received ?? item.quantity_disbursed ?? 0);
    if (returnQty <= 0) continue;

    const { data: invItem } = await service
      .from('inventory_items')
      .select('id, quantity')
      .eq('id', item.inventory_item_id)
      .single();
    if (!invItem) continue;

    const qtyBefore = Number(invItem.quantity);
    const qtyAfter = qtyBefore + returnQty;

    await service
      .from('inventory_items')
      .update({ quantity: qtyAfter })
      .eq('id', invItem.id);

    await service
      .from('stock_movements')
      .insert({
        company_id: auth.companyId,
        branch_id: branchId,
        inventory_item_id: invItem.id,
        movement_type: 'kitchen_return',
        quantity_change: returnQty,
        quantity_before: qtyBefore,
        quantity_after: qtyAfter,
        unit_cost: 0,
        reference_type: 'ingredient_request',
        reference_id: body.request_id,
        notes: body.return_response_notes ? sanitizeString(body.return_response_notes) : 'Return accepted',
        performed_by: auth.userId,
        performed_by_name: auth.name,
      });

    // ── Deduct from Internal Store (kitchen or bar) ─────────────────────
    const { data: storeItem } = await service
      .from(storeTable)
      .select('id, quantity')
      .eq('branch_id', branchId)
      .eq('inventory_item_id', item.inventory_item_id)
      .maybeSingle();

    if (storeItem) {
      const kBefore = Number(storeItem.quantity);
      const kAfter = Math.max(0, kBefore - returnQty);
      await service
        .from(storeTable)
        .update({ quantity: kAfter, updated_at: new Date().toISOString() })
        .eq('id', storeItem.id);

      await service
        .from(movementTable)
        .insert({
          company_id: auth.companyId,
          branch_id: branchId,
          [storeFk]: storeItem.id,
          inventory_item_id: item.inventory_item_id,
          movement_type: 'returned_to_inventory',
          quantity_change: -(Math.min(returnQty, kBefore)),
          quantity_before: kBefore,
          quantity_after: kAfter,
          reference_type: 'ingredient_request',
          reference_id: body.request_id,
          notes: body.return_response_notes ? sanitizeString(body.return_response_notes) : 'Returned to inventory',
          performed_by: auth.userId,
          performed_by_name: auth.name,
        });
    }
  }

  await service
    .from('ingredient_requests')
    .update({
      status: 'returned',
      returned_at: new Date().toISOString(),
      return_accepted_by: auth.userId,
      return_accepted_by_name: auth.name,
      return_response_notes: body.return_response_notes ? sanitizeString(body.return_response_notes) : null,
    })
    .eq('id', body.request_id);

  return jsonResponse({ accepted: true });
}

// ─── Reject Return (inventory rejects return, status reverts to received) ───

async function rejectReturnIngredientRequest(req: Request, supabase: any, auth: AuthContext, branchId: string) {
  if (req.method !== 'POST') return errorResponse('Method not allowed', 405);
  if (!hasPermission(auth, 'manage_inventory')) return errorResponse('Forbidden', 403);

  const body = await req.json();
  if (!body.request_id) return errorResponse('Missing request_id');

  const service = createServiceClient();

  const { data: request } = await service
    .from('ingredient_requests')
    .select('status')
    .eq('id', body.request_id)
    .eq('branch_id', branchId)
    .single();
  if (!request) return errorResponse('Request not found', 404);
  if (request.status !== 'return_requested') {
    return errorResponse('Only return-requested items can be rejected', 400);
  }

  await service
    .from('ingredient_requests')
    .update({
      status: 'received',
      return_notes: null,
      return_accepted_by: auth.userId,
      return_accepted_by_name: auth.name,
      return_response_notes: body.return_response_notes
        ? sanitizeString(body.return_response_notes)
        : 'Return rejected',
    })
    .eq('id', body.request_id);

  return jsonResponse({ rejected: true });
}
