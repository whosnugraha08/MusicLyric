-- ============================================================
-- LyricStage Database Schema
-- Run this in your Supabase SQL Editor (Dashboard > SQL Editor)
-- ============================================================

-- ────────────────────────────────────────────────────────────
-- 1. SONGS TABLE
-- ────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS songs (
  id            uuid          PRIMARY KEY DEFAULT gen_random_uuid(),
  title         text          NOT NULL,
  artist        text          DEFAULT '',
  audio_url     text,
  cover_url     text,
  raw_lyrics    text,
  synced_lyrics jsonb,
  sync_status   text          DEFAULT 'unsynced'
                              CHECK (sync_status IN (
                                'unsynced',
                                'processing',
                                'synced',
                                'needs_correction',
                                'failed'
                              )),
  duration      float,
  created_at    timestamptz   DEFAULT now(),
  updated_at    timestamptz   DEFAULT now()
);

-- Index on sync_status for filtering
CREATE INDEX IF NOT EXISTS idx_songs_sync_status ON songs (sync_status);

-- Index on created_at for ordering
CREATE INDEX IF NOT EXISTS idx_songs_created_at ON songs (created_at DESC);

-- ────────────────────────────────────────────────────────────
-- 2. UPDATED_AT TRIGGER
-- ────────────────────────────────────────────────────────────

-- Generic trigger function — reusable for any table
CREATE OR REPLACE FUNCTION set_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Attach trigger to the songs table
DROP TRIGGER IF EXISTS trigger_songs_updated_at ON songs;
CREATE TRIGGER trigger_songs_updated_at
  BEFORE UPDATE ON songs
  FOR EACH ROW
  EXECUTE FUNCTION set_updated_at();

-- ────────────────────────────────────────────────────────────
-- 3. ROW LEVEL SECURITY (RLS)
-- ────────────────────────────────────────────────────────────
-- This is a single-user personal tool.
-- RLS is enabled (Supabase requirement) but policies allow
-- all operations. Auth is enforced at the application level.
-- ────────────────────────────────────────────────────────────

ALTER TABLE songs ENABLE ROW LEVEL SECURITY;

-- Allow unrestricted SELECT
CREATE POLICY "Allow public read access"
  ON songs FOR SELECT
  USING (true);

-- Allow unrestricted INSERT
CREATE POLICY "Allow public insert access"
  ON songs FOR INSERT
  WITH CHECK (true);

-- Allow unrestricted UPDATE
CREATE POLICY "Allow public update access"
  ON songs FOR UPDATE
  USING (true)
  WITH CHECK (true);

-- Allow unrestricted DELETE
CREATE POLICY "Allow public delete access"
  ON songs FOR DELETE
  USING (true);

-- ────────────────────────────────────────────────────────────
-- 4. STORAGE BUCKETS (manual setup via Dashboard)
-- ────────────────────────────────────────────────────────────
-- Go to Supabase Dashboard > Storage and create these buckets:
--
-- Bucket: "audio"
--   - Public: false (serve via signed URLs)
--   - Allowed MIME types: audio/mpeg, audio/wav, audio/ogg,
--     audio/flac, audio/mp4, audio/x-m4a
--   - Max file size: 50 MB
--
-- Bucket: "covers"
--   - Public: true  (album art can be publicly accessible)
--   - Allowed MIME types: image/jpeg, image/png, image/webp
--   - Max file size: 5 MB
--
-- Alternatively, run the SQL below (requires service_role):
-- ────────────────────────────────────────────────────────────

-- INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
-- VALUES
--   ('audio', 'audio', false, 52428800,
--    ARRAY['audio/mpeg','audio/wav','audio/ogg','audio/flac','audio/mp4','audio/x-m4a']),
--   ('covers', 'covers', true, 5242880,
--    ARRAY['image/jpeg','image/png','image/webp'])
-- ON CONFLICT (id) DO NOTHING;

-- Storage RLS policies (if using SQL bucket creation):
-- CREATE POLICY "Allow public read on covers"
--   ON storage.objects FOR SELECT
--   USING (bucket_id = 'covers');
--
-- CREATE POLICY "Allow upload to audio"
--   ON storage.objects FOR INSERT
--   WITH CHECK (bucket_id = 'audio');
--
-- CREATE POLICY "Allow upload to covers"
--   ON storage.objects FOR INSERT
--   WITH CHECK (bucket_id = 'covers');
--
-- CREATE POLICY "Allow delete from audio"
--   ON storage.objects FOR DELETE
--   USING (bucket_id = 'audio');
--
-- CREATE POLICY "Allow delete from covers"
--   ON storage.objects FOR DELETE
--   USING (bucket_id = 'covers');
