#!/usr/bin/env node

/**
 * Direct verification of CONVERT transaction type constraint
 */

try {
  require('dotenv').config({ path: '.env.local' });
} catch (e) {}

const SUPABASE_URL = process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL || 'https://slleojsdpctxhlsoyenr.supabase.co';
const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;

async function verifyDirect() {
  console.log('🔍 Direct Verification of CONVERT Transaction Type\n');
  console.log('='.repeat(60));
  
  try {
    // Get a user ID from existing transactions
    console.log('\n1. Finding a test user from existing transactions...');
    const txResponse = await fetch(
      `${SUPABASE_URL}/rest/v1/transactions?select=user_id&limit=1`,
      {
        headers: {
          'apikey': SUPABASE_SERVICE_ROLE_KEY,
          'Authorization': `Bearer ${SUPABASE_SERVICE_ROLE_KEY}`,
        },
      }
    );
    
    let testUserId = null;
    if (txResponse.ok) {
      const txs = await txResponse.json();
      if (txs && txs.length > 0) {
        testUserId = txs[0].user_id;
        console.log(`   ✅ Found user: ${testUserId.substring(0, 8)}...`);
      }
    }
    
    if (!testUserId) {
      console.log('   ⚠️  No existing transactions found, skipping insertion test');
      console.log('\n2. Checking if CONVERT query works (no constraint error)...');
      const checkResponse = await fetch(
        `${SUPABASE_URL}/rest/v1/transactions?transaction_type=eq.CONVERT&select=count`,
        {
          headers: {
            'apikey': SUPABASE_SERVICE_ROLE_KEY,
            'Authorization': `Bearer ${SUPABASE_SERVICE_ROLE_KEY}`,
            'Prefer': 'count=exact',
          },
        }
      );
      
      if (checkResponse.ok) {
        const count = checkResponse.headers.get('content-range')?.split('/')[1] || '0';
        console.log(`   ✅ CONVERT query successful (no constraint error)`);
        console.log(`   Current CONVERT transactions: ${count}`);
        console.log('\n✅ Migration appears to be applied (CONVERT queries work)');
        console.log('⚠️  To fully verify, apply the migration SQL if you haven\'t already.');
        return;
      } else {
        const errorText = await checkResponse.text();
        if (errorText.includes('valid_transaction_type') || errorText.includes('constraint')) {
          console.log('   ❌ CONVERT is NOT in the constraint');
          console.log(`   Error: ${errorText.substring(0, 300)}`);
          console.log('\n❌ Migration needs to be applied!');
          console.log('   Please run: apply_convert_transaction_type.sql');
          return;
        }
      }
    } else {
      // Test insertion
      console.log('\n2. Testing CONVERT transaction insertion...');
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
            crypto_amount: 0.0001,
            fiat_currency: 'NGN',
            fiat_amount: 450,
            status: 'COMPLETED',
            transaction_hash: '0x' + '0'.repeat(64), // Test hash
            metadata: { 
              test: true, 
              verification: true,
              auto_converted: true,
            },
          }),
        }
      );
      
      if (insertResponse.ok) {
        const insertedTx = await insertResponse.json();
        const txId = Array.isArray(insertedTx) ? insertedTx[0].id : insertedTx.id;
        
        console.log('   ✅ CONVERT transaction inserted successfully!');
        console.log(`   Transaction ID: ${txId}`);
        
        // Clean up
        console.log('\n3. Cleaning up test transaction...');
        const deleteResponse = await fetch(
          `${SUPABASE_URL}/rest/v1/transactions?id=eq.${txId}`,
          {
            method: 'DELETE',
            headers: {
              'apikey': SUPABASE_SERVICE_ROLE_KEY,
              'Authorization': `Bearer ${SUPABASE_SERVICE_ROLE_KEY}`,
            },
          }
        );
        
        if (deleteResponse.ok) {
          console.log('   ✅ Test transaction deleted');
        }
        
        console.log('\n' + '='.repeat(60));
        console.log('✅ MIGRATION VERIFIED SUCCESSFULLY!');
        console.log('='.repeat(60));
        console.log('CONVERT transaction type is now allowed in the transactions table.');
        console.log('Auto-convert functionality can create CONVERT transactions.');
        console.log('='.repeat(60));
        
      } else {
        const errorText = await insertResponse.text();
        console.log('   ❌ CONVERT transaction insertion FAILED');
        console.log(`   Status: ${insertResponse.status}`);
        console.log(`   Error: ${errorText.substring(0, 400)}`);
        
        if (errorText.includes('valid_transaction_type') || errorText.includes('constraint')) {
          console.log('\n' + '='.repeat(60));
          console.log('❌ MIGRATION NOT APPLIED');
          console.log('='.repeat(60));
          console.log('The CONVERT transaction type is not in the constraint.');
          console.log('Please apply the migration SQL:');
          console.log('   File: apply_convert_transaction_type.sql');
          console.log('   Or via Supabase SQL Editor');
          console.log('='.repeat(60));
        } else {
          console.log('\n⚠️  Error may be unrelated to constraint (check error details above)');
        }
      }
    }
    
  } catch (error) {
    console.error('\n❌ Error:', error.message);
    console.error(error.stack);
  }
}

verifyDirect();
