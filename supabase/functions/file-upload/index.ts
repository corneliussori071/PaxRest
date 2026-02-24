import { serve } from 'https://deno.land/std@0.208.0/http/server.ts';
import {
  corsResponse, jsonResponse, errorResponse,
  createUserClient, createServiceClient,
  requireAuth, resolveBranchId,
} from '../_shared/index.ts';
import type { AuthContext } from '../_shared/index.ts';

const ALLOWED_TYPES = ['image/jpeg', 'image/png', 'image/webp', 'image/gif', 'video/mp4', 'video/webm', 'application/pdf'];
const MAX_FILE_SIZE = 15 * 1024 * 1024; // 15 MB

const BUCKETS: Record<string, string> = {
  'menu': 'menu-images',
  'receipt': 'receipts',
  'wastage': 'wastage-photos',
  'profile': 'profile-avatars',
  'document': 'documents',
};

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

    switch (action) {
      case 'upload':
        return await uploadFile(req, supabase, auth, branchId);
      case 'get-url':
        return await getSignedUrl(req, supabase, auth);
      case 'delete':
        return await deleteFile(req, supabase, auth);
      case 'list':
        return await listFiles(req, supabase, auth, branchId);
      default:
        return errorResponse('Unknown file-upload action', 404);
    }
  } catch (err) {
    console.error('File upload error:', err);
    return errorResponse(err.message ?? 'Internal server error', 500);
  }
});

async function uploadFile(req: Request, supabase: any, auth: AuthContext, branchId: string | null) {
  if (req.method !== 'POST') return errorResponse('Method not allowed', 405);

  const formData = await req.formData();
  const file = formData.get('file') as File | null;
  const category = formData.get('category') as string ?? 'document';
  const referenceId = formData.get('reference_id') as string | null;
  const referenceType = formData.get('reference_type') as string | null;

  if (!file) return errorResponse('No file provided');

  // Sanitize filename: strip path traversal and non-safe characters
  const rawName = file.name ?? 'upload';
  const safeName = rawName.replace(/\.\./g, '').replace(/[^a-zA-Z0-9._-]/g, '_');

  if (!ALLOWED_TYPES.includes(file.type)) {
    return errorResponse(`File type ${file.type} not allowed. Allowed: ${ALLOWED_TYPES.join(', ')}`);
  }
  if (file.size > MAX_FILE_SIZE) {
    return errorResponse(`File too large (${(file.size / 1024 / 1024).toFixed(1)}MB). Max: ${MAX_FILE_SIZE / (1024 * 1024)}MB`);
  }

  const bucket = BUCKETS[category] ?? 'documents';
  const ext = safeName.split('.').pop() ?? 'bin';
  const timestamp = Date.now();
  const path = branchId
    ? `${auth.companyId}/${branchId}/${timestamp}_${crypto.randomUUID().slice(0, 8)}.${ext}`
    : `${auth.companyId}/${timestamp}_${crypto.randomUUID().slice(0, 8)}.${ext}`;

  const { data, error } = await supabase.storage
    .from(bucket)
    .upload(path, file, {
      contentType: file.type,
      upsert: false,
    });

  if (error) return errorResponse(`Upload failed: ${error.message}`);

  // Record in file_references
  const svcClient = createServiceClient();
  const { data: fileRef, error: refErr } = await svcClient
    .from('file_references')
    .insert({
      company_id: auth.companyId,
      branch_id: branchId,
      bucket,
      path: data.path,
      filename: safeName,
      content_type: file.type,
      size_bytes: file.size,
      reference_type: referenceType ?? category,
      reference_id: referenceId,
      uploaded_by: auth.userId,
    })
    .select()
    .single();

  if (refErr) console.error('File reference insert error:', refErr);

  // Get public URL if bucket is public, otherwise omit
  const { data: urlData } = supabase.storage.from(bucket).getPublicUrl(data.path);

  return jsonResponse({
    file: {
      id: fileRef?.id,
      path: data.path,
      bucket,
      url: urlData?.publicUrl,
      filename: file.name,
      content_type: file.type,
      size_bytes: file.size,
    },
  }, 201);
}

async function getSignedUrl(req: Request, supabase: any, auth: AuthContext) {
  const url = new URL(req.url);
  const bucket = url.searchParams.get('bucket');
  const path = url.searchParams.get('path');
  if (!bucket || !path) return errorResponse('Missing bucket or path');

  // Verify the path belongs to the company
  if (!path.startsWith(auth.companyId)) {
    return errorResponse('Forbidden', 403);
  }

  const { data, error } = await supabase.storage
    .from(bucket)
    .createSignedUrl(path, 3600); // 1 hour

  if (error) return errorResponse(error.message);
  return jsonResponse({ url: data.signedUrl });
}

async function deleteFile(req: Request, supabase: any, auth: AuthContext) {
  if (req.method !== 'POST') return errorResponse('Method not allowed', 405);
  const body = await req.json();
  if (!body.bucket || !body.path) return errorResponse('Missing bucket or path');

  if (!body.path.startsWith(auth.companyId)) {
    return errorResponse('Forbidden', 403);
  }

  const { error } = await supabase.storage.from(body.bucket).remove([body.path]);
  if (error) return errorResponse(error.message);

  // Remove file reference
  const svcClient = createServiceClient();
  await svcClient.from('file_references').delete()
    .eq('path', body.path).eq('bucket', body.bucket);

  return jsonResponse({ deleted: true });
}

async function listFiles(req: Request, supabase: any, auth: AuthContext, branchId: string | null) {
  const url = new URL(req.url);
  const referenceType = url.searchParams.get('reference_type');
  const referenceId = url.searchParams.get('reference_id');

  let query = supabase
    .from('file_references')
    .select('*')
    .eq('company_id', auth.companyId)
    .order('created_at', { ascending: false });

  if (branchId) query = query.eq('branch_id', branchId);
  if (referenceType) query = query.eq('reference_type', referenceType);
  if (referenceId) query = query.eq('reference_id', referenceId);

  const { data, error } = await query.limit(50);
  if (error) return errorResponse(error.message);

  return jsonResponse({ files: data });
}
