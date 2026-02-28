-- Create public media bucket for room images/videos
-- Used by AccommodationPage CreateRooms tab for room photo/video uploads

INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES (
  'media',
  'media',
  true,   -- public so room images render without auth token
  10485760, -- 10 MB
  ARRAY[
    'image/jpeg', 'image/jpg', 'image/png', 'image/webp', 'image/gif',
    'video/mp4', 'video/webm', 'video/ogg', 'video/quicktime'
  ]
)
ON CONFLICT (id) DO NOTHING;

-- ── RLS Policies ────────────────────────────────────────────────────────────

-- Public read (required so <img src="..."> works without auth)
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'storage' AND tablename = 'objects'
      AND policyname = 'Public read media'
  ) THEN
    EXECUTE 'CREATE POLICY "Public read media" ON storage.objects
      FOR SELECT USING (bucket_id = ''media'')';
  END IF;
END $$;

-- Authenticated users can upload
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'storage' AND tablename = 'objects'
      AND policyname = 'Auth insert media'
  ) THEN
    EXECUTE 'CREATE POLICY "Auth insert media" ON storage.objects
      FOR INSERT WITH CHECK (bucket_id = ''media'' AND auth.role() = ''authenticated'')';
  END IF;
END $$;

-- Authenticated users can update their own objects
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'storage' AND tablename = 'objects'
      AND policyname = 'Auth update media'
  ) THEN
    EXECUTE 'CREATE POLICY "Auth update media" ON storage.objects
      FOR UPDATE USING (bucket_id = ''media'' AND auth.role() = ''authenticated'')';
  END IF;
END $$;

-- Authenticated users can delete their own objects
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'storage' AND tablename = 'objects'
      AND policyname = 'Auth delete media'
  ) THEN
    EXECUTE 'CREATE POLICY "Auth delete media" ON storage.objects
      FOR DELETE USING (bucket_id = ''media'' AND auth.role() = ''authenticated'')';
  END IF;
END $$;
