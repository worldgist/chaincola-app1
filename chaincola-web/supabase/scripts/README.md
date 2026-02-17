# Supabase Storage Setup Scripts

This directory contains scripts for setting up Supabase storage buckets and related infrastructure.

## Verification Documents Storage

### Create Verification Storage Bucket

Creates the `verification-documents` storage bucket for passport photos and ID cards (NIN).

**Prerequisites:**
- Set `NEXT_PUBLIC_SUPABASE_URL` or `SUPABASE_URL` in your `.env.local`
- Set `SUPABASE_SERVICE_ROLE_KEY` in your `.env.local` (get from Supabase Dashboard → Settings → API)

**Usage:**
```bash
# Install dependencies if needed
npm install @supabase/supabase-js tsx

# Run the script
npx tsx supabase/scripts/create-verification-storage-bucket.ts
```

**Or create manually via Supabase Dashboard:**
1. Go to [Supabase Dashboard](https://app.supabase.com)
2. Navigate to Storage
3. Click "New bucket"
4. Configure:
   - **Name:** `verification-documents`
   - **Public:** `false` (private bucket)
   - **File size limit:** `10MB` (or as needed)
   - **Allowed MIME types:** `image/jpeg`, `image/jpg`, `image/png`, `image/webp`
5. Click "Create bucket"

**After creating the bucket:**
- Apply the migration: `supabase db push`
- The storage policies will be automatically set up

## Storage Policies

The migration `20241224000016_create_verification_storage_buckets.sql` sets up the following policies:

- **Users can upload/view/update/delete** their own verification documents
- **Admins can view/delete** all verification documents
- **Service role** has full access for backend operations

Files are organized by user ID:
```
verification-documents/
  └── {user_id}/
      ├── {timestamp}_nin_front.jpg
      ├── {timestamp}_nin_back.jpg
      └── {timestamp}_passport_photo.jpg
```















