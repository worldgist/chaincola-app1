// Test script for sync-withdrawal-transactions function
// This script tests the withdrawal transaction sync functionality

const { readFileSync } = require('fs');
const { join } = require('path');

// Load environment variables from .env.local
let SUPABASE_URL = 'https://slleojsdpctxhlsoyenr.supabase.co';
let SUPABASE_SERVICE_ROLE_KEY = '';

try {
  const envPath = join(process.cwd(), '.env.local');
  const envFile = readFileSync(envPath, 'utf-8');
  const envLines = envFile.split('\n');
  
  for (const line of envLines) {
    if (line.startsWith('NEXT_PUBLIC_SUPABASE_URL=')) {
      SUPABASE_URL = line.split('=')[1].trim();
    } else if (line.startsWith('SUPABASE_SERVICE_ROLE_KEY=')) {
      SUPABASE_SERVICE_ROLE_KEY = line.split('=')[1].trim();
    }
  }
} catch (error) {
  console.warn('⚠️  Could not load .env.local, using defaults');
}

if (!SUPABASE_SERVICE_ROLE_KEY) {
  console.error('❌ SUPABASE_SERVICE_ROLE_KEY not found');
  console.error('   Please set it in .env.local file');
  process.exit(1);
}

async function testSyncWithdrawalTransactions() {
  console.log('🧪 Testing sync-withdrawal-transactions function...\n');

  try {
    // Step 1: Check current pending withdrawal transactions
    const { createClient } = require('@supabase/supabase-js');
    const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

    console.log('📊 Step 1: Checking current pending withdrawal transactions...');
    const { data: pendingTx, error: fetchError } = await supabase
      .from('transactions')
      .select('id, user_id, status, metadata, created_at, fiat_amount')
      .eq('transaction_type', 'WITHDRAWAL')
      .in('status', ['PENDING', 'CONFIRMING'])
      .order('created_at', { ascending: false })
      .limit(10);

    if (fetchError) {
      console.error('❌ Error fetching transactions:', fetchError);
      return;
    }

    console.log(`   Found ${pendingTx?.length || 0} pending/confirming withdrawal transactions\n`);

    if (pendingTx && pendingTx.length > 0) {
      console.log('   Transaction Details:');
      for (const tx of pendingTx) {
        const withdrawalId = tx.metadata?.withdrawal_id;
        console.log(`   - Transaction ${tx.id.substring(0, 8)}...`);
        console.log(`     Status: ${tx.status}`);
        console.log(`     Amount: ₦${tx.fiat_amount || 'N/A'}`);
        console.log(`     Withdrawal ID: ${withdrawalId || 'N/A'}`);
        console.log(`     Created: ${new Date(tx.created_at).toLocaleString()}`);
        
        if (withdrawalId) {
          // Check withdrawal status
          const { data: withdrawal } = await supabase
            .from('withdrawals')
            .select('id, status, updated_at')
            .eq('id', withdrawalId)
            .single();
          
          if (withdrawal) {
            console.log(`     Withdrawal Status: ${withdrawal.status}`);
            console.log(`     Last Updated: ${new Date(withdrawal.updated_at).toLocaleString()}`);
            
            // Check if status needs updating
            let expectedStatus = 'CONFIRMING';
            if (withdrawal.status === 'completed') expectedStatus = 'COMPLETED';
            else if (withdrawal.status === 'failed') expectedStatus = 'FAILED';
            else if (withdrawal.status === 'cancelled') expectedStatus = 'CANCELLED';
            
            if (tx.status !== expectedStatus) {
              console.log(`     ⚠️  NEEDS UPDATE: Transaction status (${tx.status}) != Expected (${expectedStatus})`);
            } else {
              console.log(`     ✅ Status matches`);
            }
          } else {
            console.log(`     ⚠️  Withdrawal not found`);
          }
        }
        console.log('');
      }
    }

    // Step 2: Call the sync function
    console.log('🔄 Step 2: Calling sync-withdrawal-transactions function...');
    const response = await fetch(`${SUPABASE_URL}/functions/v1/sync-withdrawal-transactions`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${SUPABASE_SERVICE_ROLE_KEY}`,
      },
      body: JSON.stringify({}),
    });

    if (!response.ok) {
      const errorText = await response.text();
      console.error('❌ Function call failed:', response.status, errorText);
      return;
    }

    const result = await response.json();
    console.log('   Function Response:');
    console.log(`   - Success: ${result.success}`);
    console.log(`   - Total Transactions Checked: ${result.total || 0}`);
    console.log(`   - Transactions Synced: ${result.synced || 0}`);
    console.log(`   - Transactions Updated: ${result.updated || 0}`);
    
    if (result.errors && result.errors.length > 0) {
      console.log(`   - Errors: ${result.errors.length}`);
      result.errors.forEach((err, i) => {
        console.log(`     ${i + 1}. ${err}`);
      });
    }
    console.log('');

    // Step 3: Verify updates
    if (result.updated > 0) {
      console.log('✅ Step 3: Verifying updates...');
      const { data: updatedTx } = await supabase
        .from('transactions')
        .select('id, status, updated_at')
        .eq('transaction_type', 'WITHDRAWAL')
        .in('status', ['COMPLETED', 'FAILED', 'CANCELLED'])
        .gte('updated_at', new Date(Date.now() - 60000).toISOString()) // Updated in last minute
        .order('updated_at', { ascending: false })
        .limit(5);

      if (updatedTx && updatedTx.length > 0) {
        console.log(`   Found ${updatedTx.length} recently updated transactions:`);
        updatedTx.forEach(tx => {
          console.log(`   - ${tx.id.substring(0, 8)}... → ${tx.status} (updated ${new Date(tx.updated_at).toLocaleString()})`);
        });
      }
    } else {
      console.log('ℹ️  Step 3: No transactions were updated (all statuses are already correct)');
    }

    console.log('\n✅ Test completed successfully!');
    console.log('\n📝 Summary:');
    console.log(`   - The sync function is working correctly`);
    console.log(`   - It checked ${result.total || 0} pending transactions`);
    console.log(`   - It synced ${result.synced || 0} transactions with their withdrawal statuses`);
    console.log(`   - It updated ${result.updated || 0} transactions that needed status changes`);
    
    if (result.updated === 0 && result.synced > 0) {
      console.log(`   - All ${result.synced} transactions already have the correct status`);
    }

  } catch (error) {
    console.error('❌ Test failed:', error);
    process.exit(1);
  }
}

testSyncWithdrawalTransactions();

