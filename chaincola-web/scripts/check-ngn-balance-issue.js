const { createClient } = require('@supabase/supabase-js');
require('dotenv').config({ path: '.env.local' });

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || 'https://slleojsdpctxhlsoyenr.supabase.co';
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY || 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InNsbGVvanNkcGN0eGhsc295ZW5yIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc2NjE2NTk5MSwiZXhwIjoyMDgxNzQxOTkxfQ.Tx3O8EyKK3ZqcJef2CloZI4RTmDY9Ab59SXBgmubBsA';

const supabase = createClient(supabaseUrl, supabaseServiceKey);

async function checkBalance() {
  try {
    const email = 'worldgistmedia14@gmail.com';
    
    console.log(`🔍 Checking NGN balance for: ${email}\n`);
    
    // Get auth user ID
    const { data: authUsers } = await supabase.auth.admin.listUsers();
    const authUser = authUsers?.users?.find(u => u.email === email);
    if (!authUser) {
      console.error('❌ User not found');
      return;
    }
    
    const userId = authUser.id;
    console.log(`✅ User ID: ${userId}\n`);
    
    // Check wallet_balances
    const { data: ngnBalance } = await supabase
      .from('wallet_balances')
      .select('*')
      .eq('user_id', userId)
      .eq('currency', 'NGN')
      .single();
    
    console.log(`💰 wallet_balances:`);
    if (ngnBalance) {
      console.log(`   Balance: ₦${ngnBalance.balance || 0}`);
      console.log(`   Locked: ₦${ngnBalance.locked || 0}`);
    } else {
      console.log(`   No record found`);
    }
    
    // Check wallets table
    const { data: wallet } = await supabase
      .from('wallets')
      .select('*')
      .eq('user_id', userId)
      .single();
    
    console.log(`\n💰 wallets table:`);
    if (wallet) {
      console.log(`   NGN Balance: ₦${wallet.ngn_balance || 0}`);
      console.log(`   USD Balance: $${wallet.usd_balance || 0}`);
    } else {
      console.log(`   No record found`);
    }
    
    // Check recent NGN transactions
    const { data: transactions } = await supabase
      .from('transactions')
      .select('*')
      .eq('user_id', userId)
      .or('fiat_currency.eq.NGN,transaction_type.eq.SELL')
      .order('created_at', { ascending: false })
      .limit(5);
    
    console.log(`\n📋 Recent NGN/SELL transactions:`);
    if (transactions && transactions.length > 0) {
      transactions.forEach((tx, idx) => {
        console.log(`\n   ${idx + 1}. ${tx.transaction_type} - ${tx.created_at}`);
        if (tx.fiat_amount) {
          console.log(`      Fiat: ₦${tx.fiat_amount} ${tx.fiat_currency}`);
        }
        if (tx.crypto_amount) {
          console.log(`      Crypto: ${tx.crypto_amount} ${tx.crypto_currency}`);
        }
        console.log(`      Status: ${tx.status}`);
      });
    }
    
  } catch (error) {
    console.error('❌ Error:', error.message);
    console.error(error);
  }
}

checkBalance();


