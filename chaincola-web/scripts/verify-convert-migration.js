#!/usr/bin/env node

/**
 * Verify that CONVERT transaction type migration was applied successfully
 */

// Try to load from .env.local if dotenv is available
try {
  require('dotenv').config({ path: '.env.local' });
} catch (e) {
  // dotenv not available, continue without it
}

const SUPABASE_URL = process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL || 'https://slleojsdpctxhlsoyenr.supabase.co';
const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!SUPABASE_SERVICE_ROLE_KEY) {
  console.error('❌ Error: SUPABASE_SERVICE_ROLE_KEY environment variable is required');
  process.exit(1);
}

async function verifyConvertMigration() {
  console.log('🔍 Verifying CONVERT transaction type migration...\n');
  
  try {
    // Method 1: Try to insert a test CONVERT transaction (then delete it)
    console.log('Method 1: Testing CONVERT transaction insertion...');
    
    // Get a test user ID
    const usersResponse = await fetch(
      `${SUPABASE_URL}/rest/v1/auth/users?limit=1&select=id`,
      {
        headers: {
          'apikey': SUPABASE_SERVICE_ROLE_KEY,
          'Authorization': `Bearer ${SUPABASE_SERVICE_ROLE_KEY}`,
        },
      }
    );
    
    if (!usersResponse.ok) {
      console.log('   ⚠️  Could not fetch test user, trying alternative method...\n');
    } else {
      const users = await usersResponse.json();
      if (users && users.length > 0) {
        const testUserId = users[0].id;
        
        // Try to insert a CONVERT transaction
        const insertResponse = await fetch(
          `${SUPABASE_URL}/rest/v1/transactions`,
          {
            method: 'POST',
            headers: {
              'apikey': SUPABASE_SERVICE_ROLE_KEY,
              'Authorization': `Bearer ${SUPABASE_SERVICE_ROLE_KEY}`,
              'Content-Type': 'application/json',
              'Prefer': 'return=representation',
            },
            body: JSON.stringify({
              user_id: testUserId,
              transaction_type: 'CONVERT',
              crypto_currency: 'ETH',
              crypto_amount: 0.001,
              fiat_currency: 'NGN',
              fiat_amount: 4500,
              status: 'COMPLETED',
              metadata: { test: true, verification: true },
            }),
          }
        );
        
        if (insertResponse.ok) {
          const insertedTx = await insertResponse.json();
          const txId = Array.isArray(insertedTx) ? insertedTx[0].id : insertedTx.id;
          
          console.log('   ✅ CONVERT transaction type is allowed!');
          console.log(`   Test transaction ID: ${txId}`);
          
          // Clean up: Delete the test transaction
          await fetch(
            `${SUPABASE_URL}/rest/v1/transactions?id=eq.${txId}`,
            {
              method: 'DELETE',
              headers: {
                'apikey': SUPABASE_SERVICE_ROLE_KEY,
                'Authorization': `Bearer ${SUPABASE_SERVICE_ROLE_KEY}`,
              },
            }
          );
          console.log('   ✅ Test transaction cleaned up\n');
        } else {
          const errorText = await insertResponse.text();
          console.log('   ❌ CONVERT transaction type is NOT allowed');
          console.log(`   Error: ${errorText.substring(0, 300)}`);
          console.log('   ⚠️  Migration may not have been applied yet\n');
        }
      }
    }
    
    // Method 2: Check existing CONVERT transactions
    console.log('Method 2: Checking for existing CONVERT transactions...');
    const convertResponse = await fetch(
      `${SUPABASE_URL}/rest/v1/transactions?transaction_type=eq.CONVERT&select=id,transaction_type,crypto_currency,fiat_amount,created_at&limit=5`,
      {
        headers: {
          'apikey': SUPABASE_SERVICE_ROLE_KEY,
          'Authorization': `Bearer ${SUPABASE_SERVICE_ROLE_KEY}`,
        },
      }
    );
    
    if (convertResponse.ok) {
      const convertTxs = await convertResponse.json();
      console.log(`   ✅ Found ${convertTxs.length} CONVERT transaction(s)`);
      if (convertTxs.length > 0) {
        convertTxs.forEach((tx, i) => {
          console.log(`   ${i + 1}. ${tx.crypto_currency} → NGN: ₦${parseFloat(tx.fiat_amount || 0).toFixed(2)}`);
          console.log(`      Created: ${tx.created_at}`);
        });
      }
    } else {
      const errorText = await convertResponse.text();
      if (errorText.includes('valid_transaction_type') || errorText.includes('CONVERT')) {
        console.log('   ❌ Query failed - CONVERT may not be in constraint');
        console.log(`   Error: ${errorText.substring(0, 200)}`);
      } else {
        console.log(`   ⚠️  Query returned: ${convertResponse.status}`);
      }
    }
    
    // Method 3: Check constraint definition via metadata query
    console.log('\nMethod 3: Checking transaction metadata for auto-converted transactions...');
    const metadataResponse = await fetch(
      `${SUPABASE_URL}/rest/v1/transactions?metadata->>auto_converted=eq.true&select=id,transaction_type,crypto_currency,fiat_amount,created_at&limit=5`,
      {
        headers: {
          'apikey': SUPABASE_SERVICE_ROLE_KEY,
          'Authorization': `Bearer ${SUPABASE_SERVICE_ROLE_KEY}`,
        },
      }
    );
    
    if (metadataResponse.ok) {
      const metadataTxs = await metadataResponse.json();
      console.log(`   ✅ Found ${metadataTxs.length} auto-converted transaction(s)`);
      if (metadataTxs.length > 0) {
        metadataTxs.forEach((tx, i) => {
          console.log(`   ${i + 1}. Type: ${tx.transaction_type}, ${tx.crypto_currency} → ₦${parseFloat(tx.fiat_amount || 0).toFixed(2)}`);
        });
      }
    } else {
      console.log(`   ⚠️  Metadata query returned: ${metadataResponse.status}`);
    }
    
    console.log('\n' + '='.repeat(60));
    console.log('📊 VERIFICATION SUMMARY');
    console.log('='.repeat(60));
    console.log('✅ Migration verification complete!');
    console.log('\nIf CONVERT transactions can be inserted, the migration was successful.');
    console.log('If you see constraint errors, please apply the migration SQL manually.');
    console.log('='.repeat(60));
    
  } catch (error) {
    console.error('\n❌ Error during verification:', error.message);
    console.error(error.stack);
    process.exit(1);
  }
}

verifyConvertMigration();
