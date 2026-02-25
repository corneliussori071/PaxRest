import { serve } from 'https://deno.land/std@0.208.0/http/server.ts';
import {
  corsResponse, jsonResponse, errorResponse,
  createUserClient, requireAuth, hasPermission, resolveBranchId,
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

  let query = supabase
    .from('ingredient_requests')
    .select('*, ingredient_request_items(*)', { count: 'exact' })
    .eq('branch_id', branchId);

  if (status) query = query.eq('status', status);

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

  const { data: request, error } = await supabase
    .from('ingredient_requests')
    .insert({
      company_id: auth.companyId,
      branch_id: branchId,
      requested_by: auth.userId,
      requested_by_name: body.requested_by_name ?? auth.email,
      status: 'pending',
      notes: body.notes ? sanitizeString(body.notes) : null,
      station: body.station ?? 'kitchen',
    })
    .select()
    .single();

  if (error) return errorResponse(error.message);

  const items = body.items.map((item: any) => ({
    request_id: request.id,
    inventory_item_id: item.inventory_item_id,
    inventory_item_name: item.inventory_item_name ?? '',
    quantity_requested: item.quantity_requested,
    unit: item.unit ?? 'pcs',
  }));

  const { error: itemsError } = await supabase
    .from('ingredient_request_items')
    .insert(items);

  if (itemsError) return errorResponse(itemsError.message);
  return jsonResponse({ request }, 201);
}

// ─── Respond to Ingredient Request ──────────────────────────────────────────

async function respondIngredientRequest(req: Request, supabase: any, auth: AuthContext, branchId: string) {
  if (req.method !== 'POST') return errorResponse('Method not allowed', 405);
  if (!hasPermission(auth, 'manage_inventory')) return errorResponse('Forbidden', 403);

  const body = await req.json();
  if (!body.request_id || !body.status) {
    return errorResponse('Missing request_id or status');
  }

  if (!['approved', 'rejected', 'fulfilled', 'cancelled'].includes(body.status)) {
    return errorResponse('Invalid status');
  }

  const { error } = await supabase
    .from('ingredient_requests')
    .update({
      status: body.status,
      approved_by: auth.userId,
      approved_by_name: body.approved_by_name ?? auth.email,
    })
    .eq('id', body.request_id)
    .eq('branch_id', branchId);

  if (error) return errorResponse(error.message);

  // If approved with quantities, update the request items
  if (body.status === 'approved' && body.items) {
    for (const item of body.items) {
      await supabase
        .from('ingredient_request_items')
        .update({ quantity_approved: item.quantity_approved })
        .eq('id', item.id);
    }
  }

  return jsonResponse({ updated: true });
}
