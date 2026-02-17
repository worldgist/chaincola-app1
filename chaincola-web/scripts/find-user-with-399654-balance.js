/**
 * Find users with NGN balance around ₦399,654
 * This helps identify the affected user
 */

const { createClient } = require('@supabase/supabase-js');
require('dotenv').config({ path: '.env.local' });

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || 'https://slleojsdpctxhlsoyenr.supabase.co';
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!supabaseServiceKey) {
  console.error('❌ Error: SUPABASE_SERVICE_ROLE_KEY not found');
  process.exit(1);
}

const supabase = createClient(supabaseUrl, supabaseServiceKey);

async function findUserWithBalance() {
  console.log('\n🔍 Searching for users with NGN balance around ₦399,654...\n');
  console.log('='.repeat(80));

  try {
    // Search user_wallets table
    const { data: userWallets, error: uwError } = await supabase
      .from('user_wallets')
      .select('user_id, ngn_balance')
      .gte('ngn_balance', 390000)
      .lte('ngn_balance', 410000)
      .order('ngn_balance', { ascending: false });

    if (uwError) {
      console.error('❌ Error querying user_wallets:', uwError);
    } else if (userWallets && userWallets.length > 0) {
      console.log(`✅ Found ${userWallets.length} user(s) with balance in range:\n`);
      
      for (const wallet of userWallets) {
        const balance = parseFloat(wallet.ngn_balance || '0');
        console.log(`User ID: ${wallet.user_id}`);
        console.log(`   Balance: ₦${balance.toLocaleString()}\n`);

        // Get user email
        const { data: userData } = await supabase.auth.admin.getUserById(wallet.user_id);
        const email = userData?.user?.email || 'N/A';
        console.log(`   Email: ${email}\n`);

        // Get recent SOL sell transactions for this user
        const { data: transactions } = await supabase
          .from('transactions')
          .select('*')
          .eq('user_id', wallet.user_id)
          .eq('crypto_currency', 'SOL')
          .eq('transaction_type', 'SELL')
          .eq('status', 'COMPLETED')
          .eq('fiat_currency', 'NGN')
          .order('created_at', { ascending: false })
          .limit(10);

        if (transactions && transactions.length > 0) {
          console.log(`   Recent SOL sell transactions:\n`);
          transactions.forEach((tx, idx) => {
            const rate = parseFloat(tx.metadata?.rate || '0');
            const expected = parseFloat(tx.crypto_amount || '0') * rate * 0.99;
            const difference = parseFloat(tx.fiat_amount || '0') - expected;
            
            console.log(`   ${idx + 1}. ${tx.id.substring(0, 8)}...`);
            console.log(`      SOL: ${tx.crypto_amount}`);
            console.log(`      NGN: ₦${parseFloat(tx.fiat_amount || '0').toLocaleString()}`);
            console.log(`      Expected: ₦${expected.toFixed(2)}`);
            console.log(`      Difference: ₦${difference.toFixed(2)}`);
            console.log(`      Date: ${new Date(tx.created_at).toLocaleString()}\n`);
          });
        }

        console.log('   ' + '-'.repeat(70) + '\n');
      }
    } else {
      console.log('⚠️  No users found with balance between ₦390,000 and ₦410,000 in user_wallets\n');
    }

    // Also check wallet_balances table
    console.log('\n🔍 Checking wallet_balances table...\n');
    const { data: walletBalances, error: wbError } = await supabase
      .from('wallet_balances')
      .select('user_id, balance')
      .eq('currency', 'NGN')
      .gte('balance', 390000)
      .lte('balance', 410000)
      .order('balance', { ascending: false });

    if (wbError) {
      console.error('❌ Error querying wallet_balances:', wbError);
    } else if (walletBalances && walletBalances.length > 0) {
      console.log(`✅ Found ${walletBalances.length} user(s) with balance in range:\n`);
      
      for (const wb of walletBalances) {
        const balance = parseFloat(wb.balance || '0');
        console.log(`User ID: ${wb.user_id}`);
        console.log(`   Balance: ₦${balance.toLocaleString()}\n`);

        // Get user email
        const { data: userData } = await supabase.auth.admin.getUserById(wb.user_id);
        const email = userData?.user?.email || 'N/A';
        console.log(`   Email: ${email}\n`);
      }
    } else {
      console.log('⚠️  No users found with balance between ₦390,000 and ₦410,000 in wallet_balances\n');
    }

    // Show all users with balances > ₦300,000 to see if there's a pattern
    console.log('\n🔍 Showing users with NGN balance > ₦300,000:\n');
    const { data: highBalances } = await supabase
      .from('user_wallets')
      .select('user_id, ngn_balance')
      .gte('ngn_balance', 300000)
      .order('ngn_balance', { ascending: false })
      .limit(20);

    if (highBalances && highBalances.length > 0) {
      highBalances.forEach((wallet, idx) => {
        const balance = parseFloat(wallet.ngn_balance || '0');
        console.log(`${idx + 1}. User: ${wallet.user_id} | Balance: ₦${balance.toLocaleString()}`);
      });
    } else {
      console.log('   No users found with balance > ₦300,000\n');
    }

  } catch (error) {
    console.error('❌ Error:', error);
  }
}

findUserWithBalance().catch(console.error);
