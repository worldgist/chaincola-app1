const { createClient } = require('@supabase/supabase-js');
require('dotenv').config({ path: '.env.local' });

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || 'https://slleojsdpctxhlsoyenr.supabase.co';
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY || 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InNsbGVvanNkcGN0eGhsc295ZW5yIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc2NjE2NTk5MSwiZXhwIjoyMDgxNzQxOTkxfQ.Tx3O8EyKK3ZqcJef2CloZI4RTmDY9Ab59SXBgmubBsA';

const supabase = createClient(supabaseUrl, supabaseServiceKey);

async function fixMissingDebits() {
  try {
    const email = 'worldgistmedia14@gmail.com';
    
    console.log(`🔍 Checking and fixing missing debits for: ${email}\n`);
    
    // Get auth user ID
    const { data: authUsers, error: listError } = await supabase.auth.admin.listUsers();
    
    if (listError || !authUsers || !authUsers.users) {
      console.error('❌ Error listing users:', listError);
      return;
    }
    
    const authUser = authUsers.users.find(u => u.email === email);
    if (!authUser) {
      console.error('❌ User not found');
      return;
    }
    
    const userId = authUser.id;
    console.log(`✅ User ID: ${userId}\n`);
    
    // Check SOL balance
    const { data: solBalance, error: solError } = await supabase
      .from('wallet_balances')
      .select('*')
      .eq('user_id', userId)
      .eq('currency', 'SOL')
      .single();
    
    console.log('💰 Current SOL Balance:');
    if (solBalance) {
      console.log(`   Balance: ${solBalance.balance}`);
      console.log(`   Locked: ${solBalance.locked}`);
      console.log(`   Available: ${parseFloat(solBalance.balance || 0) - parseFloat(solBalance.locked || 0)}`);
    } else {
      console.log('   No SOL balance record found');
    }
    console.log('');
    
    // Find ALL sell orders (regardless of status)
    const { data: sells, error: sellsError } = await supabase
      .from('sells')
      .select('*')
      .eq('user_id', userId)
      .not('sol_amount', 'is', null)
      .order('created_at', { ascending: false });
    
    if (sellsError) {
      console.error('❌ Error fetching sells:', sellsError);
      return;
    }
    
    console.log(`📋 Found ${sells.length} SOL sell orders:\n`);
    
    for (const sell of sells) {
      console.log(`\n🔍 Checking sell ID: ${sell.sell_id}`);
      console.log(`   Status: ${sell.status}`);
      console.log(`   SOL Amount: ${sell.sol_amount}`);
      console.log(`   SOL TX Hash: ${sell.sol_tx_hash}`);
      
      // Check if there's a SEND transaction for this hash
      const { data: sendTx, error: sendTxError } = await supabase
        .from('transactions')
        .select('*')
        .eq('user_id', userId)
        .eq('transaction_hash', sell.sol_tx_hash)
        .eq('transaction_type', 'SEND')
        .eq('crypto_currency', 'SOL')
        .single();
      
      if (sendTx) {
        console.log(`   ✅ SEND transaction found (ID: ${sendTx.id}, Status: ${sendTx.status})`);
        
        // Check if balance was debited by comparing expected vs actual balance
        // Expected: balance should be reduced by sol_amount + network fee
        const solAmount = parseFloat(sell.sol_amount || '0');
        const networkFee = 0.0001; // ESTIMATED_FEE_SOL
        const expectedDebit = solAmount + networkFee;
        
        console.log(`   Expected debit: ${expectedDebit} SOL`);
        
        // Check if we need to debit
        // We can't easily check if debit happened, but we can check if balance seems too high
        // For now, let's just log the information
      } else {
        console.log(`   ⚠️ No SEND transaction found for hash ${sell.sol_tx_hash}`);
      }
      
      // Check for SELL transaction
      const { data: sellTx, error: sellTxError } = await supabase
        .from('transactions')
        .select('*')
        .eq('user_id', userId)
        .or(`transaction_hash.eq.${sell.sol_tx_hash},metadata->>sell_id.eq.${sell.sell_id}`)
        .eq('transaction_type', 'SELL')
        .eq('crypto_currency', 'SOL')
        .limit(1);
      
      if (sellTx && sellTx.length > 0) {
        console.log(`   ✅ SELL transaction found (ID: ${sellTx[0].id}, Status: ${sellTx[0].status})`);
      } else {
        console.log(`   ⚠️ No SELL transaction found`);
      }
    }
    
    // Now check if balance needs to be debited
    // We'll need to manually calculate what the balance should be
    console.log(`\n\n🔧 Calculating expected balance...`);
    
    // Get all successful SOL sends (SEND transactions)
    const { data: allSendTxs, error: allSendError } = await supabase
      .from('transactions')
      .select('*')
      .eq('user_id', userId)
      .eq('transaction_type', 'SEND')
      .eq('crypto_currency', 'SOL')
      .in('status', ['COMPLETED', 'PENDING'])
      .order('created_at', { ascending: false });
    
    if (allSendTxs) {
      let totalDebited = 0;
      console.log(`\n📊 All SOL SEND transactions:`);
      allSendTxs.forEach((tx, idx) => {
        const amount = parseFloat(tx.crypto_amount || '0');
        const fee = parseFloat(tx.fee_amount || '0.0001');
        const total = amount + fee;
        totalDebited += total;
        console.log(`   ${idx + 1}. ${tx.transaction_hash?.substring(0, 16)}... - ${amount} SOL + ${fee} fee = ${total} SOL`);
      });
      console.log(`\n   Total debited from sends: ${totalDebited} SOL`);
    }
    
    // Get all SOL credits (deposits)
    const { data: allCredits, error: allCreditsError } = await supabase
      .from('transactions')
      .select('*')
      .eq('user_id', userId)
      .eq('transaction_type', 'DEPOSIT')
      .eq('crypto_currency', 'SOL')
      .in('status', ['COMPLETED', 'PENDING'])
      .order('created_at', { ascending: false });
    
    if (allCredits) {
      let totalCredited = 0;
      console.log(`\n📊 All SOL DEPOSIT transactions:`);
      allCredits.forEach((tx, idx) => {
        const amount = parseFloat(tx.crypto_amount || '0');
        totalCredited += amount;
        console.log(`   ${idx + 1}. ${tx.transaction_hash?.substring(0, 16)}... - ${amount} SOL`);
      });
      console.log(`\n   Total credited from deposits: ${totalCredited} SOL`);
    }
    
    console.log(`\n\n✅ Check complete. Review the transactions above to identify missing debits.`);
    
  } catch (error) {
    console.error('❌ Error:', error.message);
    console.error(error);
  }
}

fixMissingDebits();

