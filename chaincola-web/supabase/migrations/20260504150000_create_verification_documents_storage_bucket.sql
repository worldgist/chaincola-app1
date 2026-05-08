-- Create private storage bucket for KYC / NIN uploads (app uses .from('verification-documents')).
-- Policies already exist from 20241224000016_create_verification_storage_buckets.sql.

INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
SELECT
  'verification-documents',
  'verification-documents',
  false,
  10485760,
  ARRAY['image/jpeg', 'image/jpg', 'image/png', 'image/webp']::text[]
WHERE NOT EXISTS (
  SELECT 1 FROM storage.buckets WHERE name = 'verification-documents'
);
