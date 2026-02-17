/**
 * Script to create the verification-documents storage bucket in Supabase
 * 
 * This script creates the storage bucket for passport photos and ID cards (NIN).
 * Run this script after applying the migration that sets up the storage policies.
 * 
 * Usage:
 *   npx tsx supabase/scripts/create-verification-storage-bucket.ts
 * 
 * Or via Supabase CLI:
 *   supabase functions serve (if running locally)
 *   Or create the bucket manually via Supabase Dashboard:
 *   1. Go to Storage in Supabase Dashboard
 *   2. Click "New bucket"
 *   3. Name: verification-documents
 *   4. Public: false (private bucket)
 *   5. File size limit: 10MB (or as needed)
 *   6. Allowed MIME types: image/jpeg, image/png, image/jpg
 */

import { createClient } from '@supabase/supabase-js';

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || process.env.SUPABASE_URL;
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!supabaseUrl || !supabaseServiceKey) {
  console.error('❌ Missing required environment variables:');
  console.error('   - NEXT_PUBLIC_SUPABASE_URL or SUPABASE_URL');
  console.error('   - SUPABASE_SERVICE_ROLE_KEY');
  console.error('');
  console.error('Please set these in your .env.local file');
  process.exit(1);
}

const supabase = createClient(supabaseUrl, supabaseServiceKey, {
  auth: {
    autoRefreshToken: false,
    persistSession: false,
  },
});

async function createVerificationStorageBucket() {
  try {
    console.log('🔍 Checking if verification-documents bucket exists...');

    // Check if bucket already exists
    const { data: buckets, error: listError } = await supabase.storage.listBuckets();

    if (listError) {
      console.error('❌ Error listing buckets:', listError);
      return;
    }

    const bucketExists = buckets?.some((bucket) => bucket.name === 'verification-documents');

    if (bucketExists) {
      console.log('✅ Bucket "verification-documents" already exists');
      return;
    }

    console.log('📦 Creating verification-documents bucket...');

    // Create the bucket
    const { data, error } = await supabase.storage.createBucket('verification-documents', {
      public: false, // Private bucket - users can only access their own files
      fileSizeLimit: 10485760, // 10MB limit
      allowedMimeTypes: ['image/jpeg', 'image/jpg', 'image/png', 'image/webp'],
    });

    if (error) {
      console.error('❌ Error creating bucket:', error);
      return;
    }

    console.log('✅ Successfully created verification-documents bucket');
    console.log('');
    console.log('📋 Bucket configuration:');
    console.log('   - Name: verification-documents');
    console.log('   - Public: false (private)');
    console.log('   - File size limit: 10MB');
    console.log('   - Allowed MIME types: image/jpeg, image/jpg, image/png, image/webp');
    console.log('');
    console.log('✅ Storage policies have been set up via migration');
    console.log('   Users can upload/view their own files in: verification-documents/{user_id}/');
  } catch (error: any) {
    console.error('❌ Unexpected error:', error.message);
  }
}

// Run the script
createVerificationStorageBucket();















