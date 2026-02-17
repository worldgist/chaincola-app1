/**
 * Quick script to create verification-documents storage bucket
 * Usage: node scripts/create-verification-bucket.js
 */

require('dotenv').config({ path: '.env.local' });

const { createClient } = require('@supabase/supabase-js');

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || process.env.SUPABASE_URL || 'https://slleojsdpctxhlsoyenr.supabase.co';
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!supabaseServiceKey) {
  console.error('❌ Missing SUPABASE_SERVICE_ROLE_KEY in .env.local');
  console.error('Please add: SUPABASE_SERVICE_ROLE_KEY=your_service_role_key');
  process.exit(1);
}

const supabase = createClient(supabaseUrl, supabaseServiceKey, {
  auth: {
    autoRefreshToken: false,
    persistSession: false,
  },
});

async function createBucket() {
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
      public: false, // Private bucket
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
  } catch (error) {
    console.error('❌ Unexpected error:', error.message);
  }
}

createBucket();










