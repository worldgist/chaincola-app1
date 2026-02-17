/**
 * Fix Missing NGN Credits for Instant Sell Transactions
 * 
 * This script finds users who successfully sold crypto via instant sell
 * (SOL debited from user_wallets) but didn't receive NGN credit in wallets/wallet_balances tables
 * and fixes the issue by syncing balances from user_wallets to wallets/wallet_balances
 */

const { createClient } = require('@supabase/supabase-js');
require('dotenv').config({ path: '.env.local' });

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || 'https://slleojsdpctxhlsoyenr.supabase.co';
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY || 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InNsbGVvanNkcGN0eGhsc295ZW5yIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc2NjE2NTk5MSwiZXhwIjoyMDgxNzQxOTkxfQ.Tx3O8EyKK3ZqcJef2CloZI4RTmDY9Ab59SXBgmubBsA';

const supabase = createClient(supabaseUrl, supabaseServiceKey);

async function fixInstantSellMissingNGN() {
  try {
    console.log(`\n🔍 Finding instant sell transactions with missing NGN credits...\n`);
    
    // Find all COMPLETED SELL transactions for SOL that are instant sells
    const { data: transactions, error: txError } = await supabase
      .from('transactions')
      .select('*')
      .eq('transaction_type', 'SELL')
      .eq('crypto_currency', 'SOL')
      .eq('status', 'COMPLETED')
      .not('fiat_amount', 'is', null)
      .eq('fiat_currency', 'NGN')
      .or('metadata->>instant_sell.eq.true,metadata->>type.eq.sell')
      .order('created_at', { ascending: false })
      .limit(100);
    
    if (txError) {
      console.error('❌ Error fetching transactions:', txError);
      return;
    }
    
    if (!transactions || transactions.length === 0) {
      console.log('✅ No instant sell transactions found');
      return;
    }
    
    console.log(`📋 Found ${transactions.length} instant sell transactions to check\n`);
    
    let fixedCount = 0;
    let alreadyCorrectCount = 0;
    let errorCount = 0;
    
    for (const tx of transactions) {
      try {
        console.log(`\n${'='.repeat(70)}`);
        console.log(`Transaction ID: ${tx.id}`);
        console.log(`User ID: ${tx.user_id}`);
        console.log(`SOL Amount: ${tx.crypto_amount}`);
        console.log(`NGN Amount (from transaction): ₦${tx.fiat_amount}`);
        
        // Get balances from all tables
        const [userWalletResult, walletBalancesResult, walletsResult] = await Promise.all([
          supabase
            .from('user_wallets')
            .select('ngn_balance, sol_balance')
            .eq('user_id', tx.user_id)
            .single(),
          supabase
            .from('wallet_balances')
            .select('balance, currency')
            .eq('user_id', tx.user_id)
            .in('currency', ['NGN', 'SOL']),
          supabase
            .from('wallets')
            .select('ngn_balance')
            .eq('user_id', tx.user_id)
            .single(),
        ]);
        
        const userWallet = userWalletResult.data;
        const walletBalances = walletBalancesResult.data || [];
        const wallets = walletsResult.data;
        
        const ngnFromUserWallets = userWallet ? parseFloat(userWallet.ngn_balance || '0') : 0;
        const ngnFromWalletBalances = walletBalances.find(b => b.currency === 'NGN') 
          ? parseFloat(walletBalances.find(b => b.currency === 'NGN').balance || '0') 
          : 0;
        const ngnFromWallets = wallets ? parseFloat(wallets.ngn_balance || '0') : 0;
        
        const expectedNGN = parseFloat(tx.fiat_amount || '0');
        
        console.log(`\n💰 Current balances:`);
        console.log(`   user_wallets.ngn_balance: ₦${ngnFromUserWallets.toFixed(2)}`);
        console.log(`   wallet_balances (NGN): ₦${ngnFromWalletBalances.toFixed(2)}`);
        console.log(`   wallets.ngn_balance: ₦${ngnFromWallets.toFixed(2)}`);
        console.log(`   Expected NGN (from transaction): ₦${expectedNGN.toFixed(2)}`);
        
        // Check if NGN is missing from wallets or wallet_balances
        const maxCurrentNGN = Math.max(ngnFromUserWallets, ngnFromWalletBalances, ngnFromWallets);
        const needsFix = maxCurrentNGN < expectedNGN || 
                        (ngnFromWalletBalances === 0 && ngnFromWallets === 0 && ngnFromUserWallets > 0);
        
        if (!needsFix) {
          console.log(`✅ NGN balance is correct`);
          alreadyCorrectCount++;
          continue;
        }
        
        console.log(`⚠️ NGN balance mismatch detected - fixing...`);
        
        // Use the maximum balance from all sources, then add the transaction amount if needed
        // But we need to be careful - if user_wallets has the correct balance, sync it to others
        let targetNGNBalance = Math.max(ngnFromUserWallets, ngnFromWalletBalances, ngnFromWallets);
        
        // If user_wallets has balance but others don't, use user_wallets
        if (ngnFromUserWallets > 0 && ngnFromWalletBalances === 0 && ngnFromWallets === 0) {
          targetNGNBalance = ngnFromUserWallets;
        }
        
        // If transaction amount is higher, use that (shouldn't happen but be safe)
        if (expectedNGN > targetNGNBalance) {
          targetNGNBalance = expectedNGN;
        }
        
        console.log(`   Target NGN balance: ₦${targetNGNBalance.toFixed(2)}`);
        
        // Update wallet_balances table
        console.log(`📝 Updating wallet_balances...`);
        const { error: updateBalancesError } = await supabase
          .from('wallet_balances')
          .upsert({
            user_id: tx.user_id,
            currency: 'NGN',
            balance: targetNGNBalance.toFixed(2),
            updated_at: new Date().toISOString(),
          }, {
            onConflict: 'user_id,currency',
          });
        
        if (updateBalancesError) {
          console.error(`❌ Failed to update wallet_balances:`, updateBalancesError);
          errorCount++;
          continue;
        }
        
        console.log(`✅ Updated wallet_balances`);
        
        // Update wallets table
        console.log(`📝 Updating wallets table...`);
        const { error: updateWalletsError } = await supabase
          .from('wallets')
          .upsert({
            user_id: tx.user_id,
            ngn_balance: targetNGNBalance.toFixed(2),
            usd_balance: wallets?.usd_balance || 0,
            updated_at: new Date().toISOString(),
          }, {
            onConflict: 'user_id',
          });
        
        if (updateWalletsError) {
          console.error(`⚠️ Failed to update wallets:`, updateWalletsError);
          // Don't fail, continue
        } else {
          console.log(`✅ Updated wallets table`);
        }
        
        // Also sync SOL balance if needed
        const solFromUserWallets = userWallet ? parseFloat(userWallet.sol_balance || '0') : 0;
        const solFromWalletBalances = walletBalances.find(b => b.currency === 'SOL')
          ? parseFloat(walletBalances.find(b => b.currency === 'SOL').balance || '0')
          : 0;
        
        if (solFromUserWallets !== solFromWalletBalances) {
          console.log(`📝 Syncing SOL balance...`);
          const targetSOLBalance = Math.max(solFromUserWallets, solFromWalletBalances);
          
          await supabase
            .from('wallet_balances')
            .upsert({
              user_id: tx.user_id,
              currency: 'SOL',
              balance: targetSOLBalance.toFixed(8),
              updated_at: new Date().toISOString(),
            }, {
              onConflict: 'user_id,currency',
            });
          
          console.log(`✅ Synced SOL balance`);
        }
        
        console.log(`\n✅ Successfully fixed NGN balance: ₦${targetNGNBalance.toFixed(2)}`);
        fixedCount++;
        
      } catch (error) {
        console.error(`❌ Error processing transaction ${tx.id}:`, error.message);
        errorCount++;
      }
    }
    
    console.log(`\n${'='.repeat(70)}`);
    console.log(`📊 Summary:`);
    console.log(`   Total transactions checked: ${transactions.length}`);
    console.log(`   Already correct: ${alreadyCorrectCount}`);
    console.log(`   Fixed: ${fixedCount}`);
    console.log(`   Errors: ${errorCount}`);
    console.log(`${'='.repeat(70)}\n`);
    
  } catch (error) {
    console.error('❌ Error:', error.message);
    console.error(error);
  }
}

// Run the fix
fixInstantSellMissingNGN();
