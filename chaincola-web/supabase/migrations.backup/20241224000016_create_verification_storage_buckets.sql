-- Create storage buckets for verification documents
-- This migration sets up storage policies for passport photos and ID cards (NIN)
--
-- IMPORTANT: The storage bucket must be created separately before this migration is applied.
-- You can create it via:
--   1. Supabase Dashboard: Storage → New bucket → Name: "verification-documents" → Private
--   2. Run the script: npx tsx supabase/scripts/create-verification-storage-bucket.ts
--   3. Or use the Supabase Management API
--
-- Bucket configuration:
--   - Name: verification-documents
--   - Public: false (private bucket)
--   - File size limit: 10MB (recommended)
--   - Allowed MIME types: image/jpeg, image/jpg, image/png, image/webp
--
-- File structure:
--   verification-documents/{user_id}/{timestamp}_nin_front.jpg
--   verification-documents/{user_id}/{timestamp}_nin_back.jpg
--   verification-documents/{user_id}/{timestamp}_passport_photo.jpg

-- Create bucket for verification documents (if it doesn't exist via API)
-- The bucket will be created as 'verification-documents' to store:
-- - Passport photos
-- - NIN front images
-- - NIN back images

-- Storage policies for verification-documents bucket

-- Drop existing policies if they exist (for idempotency)
DROP POLICY IF EXISTS "Users can upload own verification documents" ON storage.objects;
DROP POLICY IF EXISTS "Users can view own verification documents" ON storage.objects;
DROP POLICY IF EXISTS "Users can update own verification documents" ON storage.objects;
DROP POLICY IF EXISTS "Users can delete own verification documents" ON storage.objects;
DROP POLICY IF EXISTS "Admins can view all verification documents" ON storage.objects;
DROP POLICY IF EXISTS "Admins can delete all verification documents" ON storage.objects;
DROP POLICY IF EXISTS "Service role can manage all verification documents" ON storage.objects;

-- Policy: Users can upload their own verification documents
CREATE POLICY "Users can upload own verification documents"
ON storage.objects
FOR INSERT
TO authenticated
WITH CHECK (
  bucket_id = 'verification-documents' AND
  (storage.foldername(name))[1] = auth.uid()::text
);

-- Policy: Users can view their own verification documents
CREATE POLICY "Users can view own verification documents"
ON storage.objects
FOR SELECT
TO authenticated
USING (
  bucket_id = 'verification-documents' AND
  (storage.foldername(name))[1] = auth.uid()::text
);

-- Policy: Users can update their own verification documents
CREATE POLICY "Users can update own verification documents"
ON storage.objects
FOR UPDATE
TO authenticated
USING (
  bucket_id = 'verification-documents' AND
  (storage.foldername(name))[1] = auth.uid()::text
)
WITH CHECK (
  bucket_id = 'verification-documents' AND
  (storage.foldername(name))[1] = auth.uid()::text
);

-- Policy: Users can delete their own verification documents
CREATE POLICY "Users can delete own verification documents"
ON storage.objects
FOR DELETE
TO authenticated
USING (
  bucket_id = 'verification-documents' AND
  (storage.foldername(name))[1] = auth.uid()::text
);

-- Policy: Admins can view all verification documents
CREATE POLICY "Admins can view all verification documents"
ON storage.objects
FOR SELECT
TO authenticated
USING (
  bucket_id = 'verification-documents' AND
  public.is_user_admin(auth.uid())
);

-- Policy: Admins can delete all verification documents
CREATE POLICY "Admins can delete all verification documents"
ON storage.objects
FOR DELETE
TO authenticated
USING (
  bucket_id = 'verification-documents' AND
  public.is_user_admin(auth.uid())
);

-- Policy: Service role can do everything
CREATE POLICY "Service role can manage all verification documents"
ON storage.objects
FOR ALL
TO service_role
USING (bucket_id = 'verification-documents')
WITH CHECK (bucket_id = 'verification-documents');

-- Note: Comments on storage policies are not supported on system tables
-- Policy descriptions:
--   "Users can upload own verification documents" - Allows authenticated users to upload verification documents (passport photos, NIN front/back) to their own folder
--   "Users can view own verification documents" - Allows authenticated users to view their own verification documents
--   "Users can update own verification documents" - Allows authenticated users to update their own verification documents
--   "Users can delete own verification documents" - Allows authenticated users to delete their own verification documents
--   "Admins can view all verification documents" - Allows admins to view all verification documents for review purposes
--   "Admins can delete all verification documents" - Allows admins to delete any verification documents if needed
--   "Service role can manage all verification documents" - Allows service role to manage all verification documents for backend operations

