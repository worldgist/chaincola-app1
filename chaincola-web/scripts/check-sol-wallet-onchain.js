const { createClient } = require('@supabase/supabase-js');
require('dotenv').config({ path: '.env.local' });

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || 'https://slleojsdpctxhlsoyenr.supabase.co';
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY || 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InNsbGVvanNkcGN0eGhsc295ZW5yIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc2NjE2NTk5MSwiZXhwIjoyMDgxNzQxOTkxfQ.Tx3O8EyKK3ZqcJef2CloZI4RTmDY9Ab59SXBgmubBsA';

const supabase = createClient(supabaseUrl, supabaseServiceKey);

async function checkOnChainBalance() {
  try {
    const email = 'worldgistmedia14@gmail.com';
    
    console.log(`🔍 Checking on-chain SOL balance for: ${email}\n`);
    
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
    
    // Get user's Solana wallet from crypto_wallets table
    const { data: wallets, error: walletsError } = await supabase
      .from('crypto_wallets')
      .select('*')
      .eq('user_id', userId)
      .eq('asset', 'SOL')
      .eq('network', 'mainnet')
      .limit(1);
    
    if (walletsError) {
      console.error('❌ Error fetching wallets:', walletsError);
      return;
    }
    
    if (!wallets || wallets.length === 0) {
      console.log('❌ No Solana wallet found for user');
      return;
    }
    
    const solAddress = wallets[0].address;
    console.log(`📍 Solana Address: ${solAddress}\n`);
    
    // Check on-chain balance
    const solanaRpcUrl = process.env.SOLANA_RPC_URL || 
                         process.env.ALCHEMY_SOLANA_URL ||
                         'https://solana-mainnet.g.alchemy.com/v2/3L_iw-7-b25_bzLHmLyUJ';
    
    console.log(`🔗 Checking balance via: ${solanaRpcUrl}\n`);
    
    const balanceResponse = await fetch(solanaRpcUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        jsonrpc: '2.0',
        id: 1,
        method: 'getBalance',
        params: [solAddress],
      }),
    });
    
    if (balanceResponse.ok) {
      const balanceData = await balanceResponse.json();
      const balanceLamports = balanceData.result?.value || 0;
      const balanceSOL = balanceLamports / 1e9;
      
      console.log(`💰 On-chain Balance: ${balanceSOL} SOL (${balanceLamports} lamports)\n`);
      
      // Compare with database balance
      const { data: dbBalance, error: dbError } = await supabase
        .from('wallet_balances')
        .select('balance')
        .eq('user_id', userId)
        .eq('currency', 'SOL')
        .single();
      
      if (dbBalance) {
        const dbBalanceSOL = parseFloat(dbBalance.balance || '0');
        console.log(`💾 Database Balance: ${dbBalanceSOL} SOL\n`);
        console.log(`📊 Difference: ${balanceSOL - dbBalanceSOL} SOL\n`);
        
        if (Math.abs(balanceSOL - dbBalanceSOL) > 0.0001) {
          console.log(`⚠️ Balance mismatch detected!`);
          console.log(`   On-chain: ${balanceSOL} SOL`);
          console.log(`   Database: ${dbBalanceSOL} SOL`);
          console.log(`   Difference: ${balanceSOL - dbBalanceSOL} SOL\n`);
        } else {
          console.log(`✅ Balances match`);
        }
      }
    } else {
      const errorText = await balanceResponse.text();
      console.error(`❌ Failed to check balance: ${errorText}`);
    }
    
  } catch (error) {
    console.error('❌ Error:', error.message);
    console.error(error);
  }
}

checkOnChainBalance();

