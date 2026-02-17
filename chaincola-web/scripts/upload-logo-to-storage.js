/**
 * Upload Chaincola logo to Supabase Storage for push notifications
 * 
 * This script uploads the logo.png file to a public storage bucket
 * so it can be used as the icon in push notifications.
 * 
 * Usage:
 *   node scripts/upload-logo-to-storage.js
 * 
 * Prerequisites:
 *   - Set SUPABASE_SERVICE_ROLE_KEY in environment
 *   - Set NEXT_PUBLIC_SUPABASE_URL in environment
 *   - Logo file exists at: chaincola/assets/images/logo.png
 */

const { createClient } = require('@supabase/supabase-js');
const fs = require('fs');
const path = require('path');

// Load environment variables from .env.local if it exists
try {
  const envPath = path.join(__dirname, '../.env.local');
  if (fs.existsSync(envPath)) {
    const envFile = fs.readFileSync(envPath, 'utf8');
    envFile.split('\n').forEach(line => {
      const match = line.match(/^([^=:#]+)=(.*)$/);
      if (match) {
        const key = match[1].trim();
        const value = match[2].trim().replace(/^["']|["']$/g, '');
        if (!process.env[key]) {
          process.env[key] = value;
        }
      }
    });
  }
} catch (error) {
  console.warn('⚠️ Could not load .env.local:', error.message);
}

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || process.env.SUPABASE_URL || 'https://slleojsdpctxhlsoyenr.supabase.co';
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!supabaseKey) {
  console.error('❌ Error: SUPABASE_SERVICE_ROLE_KEY not set in environment');
  process.exit(1);
}

const supabase = createClient(supabaseUrl, supabaseKey);

async function uploadLogo() {
  try {
    // Path to logo file - try multiple possible locations
    const possiblePaths = [
      path.join(__dirname, '../../chaincola/assets/logo.png'), // Primary location (found)
      path.join(__dirname, '../../chaincola/assets/images/logo.png'), // Alternative location
      path.join(__dirname, '../chaincola/assets/logo.png'),
      path.join(__dirname, '../chaincola/assets/images/logo.png'),
      path.join(__dirname, '../../assets/images/logo.png'),
    ];
    
    let logoPath = null;
    for (const possiblePath of possiblePaths) {
      if (fs.existsSync(possiblePath)) {
        logoPath = possiblePath;
        console.log(`✅ Found logo at: ${logoPath}`);
        break;
      }
    }
    
    if (!logoPath) {
      console.error(`❌ Logo file not found. Checked:`);
      possiblePaths.forEach(p => console.error(`   - ${p}`));
      process.exit(1);
    }
    
    if (!logoPath || !fs.existsSync(logoPath)) {
      console.error(`❌ Logo file not found. Checked:`);
      possiblePaths.forEach(p => console.error(`   - ${p}`));
      console.log('💡 Make sure the logo exists at chaincola/assets/logo.png or chaincola/assets/images/logo.png');
      process.exit(1);
    }

    console.log('📤 Uploading logo to Supabase Storage...');

    // Read logo file
    const logoBuffer = fs.readFileSync(logoPath);
    
    // Create app-assets bucket if it doesn't exist (or use existing public bucket)
    const bucketName = 'app-assets';
    const filePath = 'logo.png';

    // Check if bucket exists, create if not
    const { data: buckets, error: listError } = await supabase.storage.listBuckets();
    
    if (listError) {
      console.error('❌ Error listing buckets:', listError);
      process.exit(1);
    }

    const bucketExists = buckets.some(b => b.name === bucketName);
    
    if (!bucketExists) {
      console.log(`📦 Creating bucket: ${bucketName}`);
      const { error: createError } = await supabase.storage.createBucket(bucketName, {
        public: true, // Make it public so logo URL is accessible
        fileSizeLimit: 5242880, // 5MB
        allowedMimeTypes: ['image/png', 'image/jpeg', 'image/jpg'],
      });

      if (createError) {
        console.error('❌ Error creating bucket:', createError);
        process.exit(1);
      }
      console.log('✅ Bucket created');
    }

    // Upload logo
    const { data: uploadData, error: uploadError } = await supabase.storage
      .from(bucketName)
      .upload(filePath, logoBuffer, {
        contentType: 'image/png',
        upsert: true, // Overwrite if exists
      });

    if (uploadError) {
      console.error('❌ Error uploading logo:', uploadError);
      process.exit(1);
    }

    console.log('✅ Logo uploaded successfully');

    // Get public URL
    const { data: urlData } = supabase.storage
      .from(bucketName)
      .getPublicUrl(filePath);

    console.log('\n📋 Logo URL:', urlData.publicUrl);
    console.log('\n✅ Logo is now available at:', urlData.publicUrl);
    console.log('\n💡 This URL is automatically used in push notifications via notification-config.ts');
    
  } catch (error) {
    console.error('❌ Exception:', error);
    process.exit(1);
  }
}

uploadLogo();
