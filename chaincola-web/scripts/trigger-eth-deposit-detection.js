#!/usr/bin/env node

/**
 * Manual Ethereum Deposit Detection Trigger
 * 
 * This script manually triggers the detect-ethereum-deposits Edge Function
 * to check for missed Ethereum deposits and credit user wallets.
 * 
 * Usage:
 *   node scripts/trigger-eth-deposit-detection.js
 * 
 * Or with environment variables:
 *   SUPABASE_URL=... SUPABASE_SERVICE_ROLE_KEY=... node scripts/trigger-eth-deposit-detection.js
 */

// Try to load from .env.local if dotenv is available
try {
  require('dotenv').config({ path: '.env.local' });
} catch (e) {
  // dotenv not available, continue without it
}

const SUPABASE_URL = process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL || 'https://slleojsdpctxhlsoyenr.supabase.co';
const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!SUPABASE_SERVICE_ROLE_KEY) {
  console.error('❌ Error: SUPABASE_SERVICE_ROLE_KEY environment variable is required');
  console.error('');
  console.error('Please set it in your .env.local file or export it:');
  console.error('  export SUPABASE_SERVICE_ROLE_KEY="your-service-role-key"');
  console.error('');
  console.error('Or run with:');
  console.error('  SUPABASE_SERVICE_ROLE_KEY="your-key" node scripts/trigger-eth-deposit-detection.js');
  process.exit(1);
}

const FUNCTION_URL = `${SUPABASE_URL}/functions/v1/detect-ethereum-deposits`;

async function triggerDetection() {
  console.log('🔍 Triggering Ethereum deposit detection...');
  console.log(`   Function URL: ${FUNCTION_URL}`);
  console.log('');

  try {
    const startTime = Date.now();
    
    const response = await fetch(FUNCTION_URL, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${SUPABASE_SERVICE_ROLE_KEY}`,
        'Content-Type': 'application/json',
        'apikey': SUPABASE_SERVICE_ROLE_KEY,
      },
      body: JSON.stringify({}),
    });

    const duration = Date.now() - startTime;
    const responseText = await response.text();
    
    let result;
    try {
      result = JSON.parse(responseText);
    } catch (e) {
      result = { raw: responseText };
    }

    if (!response.ok) {
      console.error(`❌ Error: HTTP ${response.status} ${response.statusText}`);
      console.error('Response:', result);
      process.exit(1);
    }

    console.log(`✅ Detection completed in ${duration}ms`);
    console.log('');

    if (result.success) {
      const data = result.data || {};
      
      console.log('📊 Results:');
      console.log(`   Wallets checked: ${data.checked || 0}`);
      console.log(`   Deposits found: ${data.depositsFound || 0}`);
      console.log(`   Deposits credited: ${data.depositsCredited || 0}`);
      console.log(`   Errors: ${data.errors?.length || 0}`);
      
      if (data.balanceReconciliation && data.balanceReconciliation.length > 0) {
        console.log('');
        console.log('⚠️  Balance Discrepancies Found:');
        data.balanceReconciliation.forEach((item, index) => {
          console.log(`   ${index + 1}. Address: ${item.address.substring(0, 10)}...`);
          console.log(`      On-chain: ${item.onChainBalance.toFixed(8)} ETH`);
          console.log(`      Database: ${item.databaseBalance.toFixed(8)} ETH`);
          console.log(`      Difference: ${item.discrepancy > 0 ? '+' : ''}${item.discrepancy.toFixed(8)} ETH`);
        });
      }
      
      if (data.errors && data.errors.length > 0) {
        console.log('');
        console.log('❌ Errors encountered:');
        data.errors.forEach((error, index) => {
          console.log(`   ${index + 1}. ${error}`);
        });
      }
      
      console.log('');
      console.log('✅ Detection process completed successfully');
    } else {
      console.error('❌ Detection failed:', result.error || 'Unknown error');
      process.exit(1);
    }
  } catch (error) {
    console.error('❌ Error triggering detection:', error.message);
    console.error('');
    console.error('Stack trace:', error.stack);
    process.exit(1);
  }
}

// Run the detection
triggerDetection();

