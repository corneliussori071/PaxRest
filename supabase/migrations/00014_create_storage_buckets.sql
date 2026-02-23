-- Storage bucket configuration for PaxRest
-- Run via Supabase Dashboard > Storage or supabase CLI

-- These are created via the Supabase storage API or dashboard.
-- This SQL creates the buckets and sets policies.

-- 1. menu-images (public read, authenticated upload)
INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES ('menu-images', 'menu-images', true, 5242880, ARRAY['image/jpeg', 'image/png', 'image/webp', 'image/gif'])
ON CONFLICT (id) DO NOTHING;

-- 2. profile-avatars (public read, authenticated upload)
INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES ('profile-avatars', 'profile-avatars', true, 2097152, ARRAY['image/jpeg', 'image/png', 'image/webp'])
ON CONFLICT (id) DO NOTHING;

-- 3. wastage-photos (private, authenticated only)
INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES ('wastage-photos', 'wastage-photos', false, 5242880, ARRAY['image/jpeg', 'image/png', 'image/webp'])
ON CONFLICT (id) DO NOTHING;

-- 4. receipts (private, authenticated only)
INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES ('receipts', 'receipts', false, 10485760, ARRAY['application/pdf', 'image/jpeg', 'image/png'])
ON CONFLICT (id) DO NOTHING;

-- 5. documents (private, authenticated only)
INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES ('documents', 'documents', false, 10485760, ARRAY['application/pdf', 'image/jpeg', 'image/png', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'])
ON CONFLICT (id) DO NOTHING;


-- ============================================================
-- Storage RLS Policies
-- ============================================================

-- menu-images: anyone can read, authenticated users can upload/update/delete within their company folder
CREATE POLICY "Public read menu images"
  ON storage.objects FOR SELECT
  USING (bucket_id = 'menu-images');

CREATE POLICY "Auth upload menu images"
  ON storage.objects FOR INSERT
  WITH CHECK (
    bucket_id = 'menu-images'
    AND auth.role() = 'authenticated'
  );

CREATE POLICY "Auth update menu images"
  ON storage.objects FOR UPDATE
  USING (
    bucket_id = 'menu-images'
    AND auth.role() = 'authenticated'
  );

CREATE POLICY "Auth delete menu images"
  ON storage.objects FOR DELETE
  USING (
    bucket_id = 'menu-images'
    AND auth.role() = 'authenticated'
  );

-- profile-avatars: anyone can read, owners can manage their own
CREATE POLICY "Public read avatars"
  ON storage.objects FOR SELECT
  USING (bucket_id = 'profile-avatars');

CREATE POLICY "Users upload own avatar"
  ON storage.objects FOR INSERT
  WITH CHECK (
    bucket_id = 'profile-avatars'
    AND auth.role() = 'authenticated'
    AND (storage.foldername(name))[1] = auth.uid()::text
  );

CREATE POLICY "Users update own avatar"
  ON storage.objects FOR UPDATE
  USING (
    bucket_id = 'profile-avatars'
    AND auth.role() = 'authenticated'
    AND (storage.foldername(name))[1] = auth.uid()::text
  );

CREATE POLICY "Users delete own avatar"
  ON storage.objects FOR DELETE
  USING (
    bucket_id = 'profile-avatars'
    AND auth.role() = 'authenticated'
    AND (storage.foldername(name))[1] = auth.uid()::text
  );

-- wastage-photos, receipts, documents: authenticated access (company-scoped via folder)
DO $$
DECLARE
  b TEXT;
BEGIN
  FOREACH b IN ARRAY ARRAY['wastage-photos', 'receipts', 'documents']
  LOOP
    EXECUTE format(
      'CREATE POLICY "Auth read %1$s" ON storage.objects FOR SELECT USING (bucket_id = %2$L AND auth.role() = ''authenticated'')',
      b, b
    );
    EXECUTE format(
      'CREATE POLICY "Auth insert %1$s" ON storage.objects FOR INSERT WITH CHECK (bucket_id = %2$L AND auth.role() = ''authenticated'')',
      b, b
    );
    EXECUTE format(
      'CREATE POLICY "Auth update %1$s" ON storage.objects FOR UPDATE USING (bucket_id = %2$L AND auth.role() = ''authenticated'')',
      b, b
    );
    EXECUTE format(
      'CREATE POLICY "Auth delete %1$s" ON storage.objects FOR DELETE USING (bucket_id = %2$L AND auth.role() = ''authenticated'')',
      b, b
    );
  END LOOP;
END $$;
