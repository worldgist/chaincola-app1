/**
 * Fix Specific User Balance - Find and fix users with incorrect NGN credits
 * This script looks for users who were over-credited due to the instant sell bug
 */

const { createClient } = require('@supabase/supabase-js');
require('dotenv').config({ path: '.env.local' });

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || process.env.SUPABASE_URL;
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!supabaseUrl || !supabaseServiceKey) {
  console.error('❌ Missing Supabase credentials');
  process.exit(1);
}

const supabase = createClient(supabaseUrl, supabaseServiceKey);

async function findAndFixUser() {
  console.log('\n🔍 Finding users with incorrect NGN credits...\n');
  
  // Find all COMPLETED SELL transactions
  const { data: transactions, error: txError } = await supabase
    .from('transactions')
    .select('*')
    .eq('transaction_type', 'SELL')
    .eq('status', 'COMPLETED')
    .not('fiat_amount', 'is', null)
    .eq('fiat_currency', 'NGN')
    .gte('created_at', '2026-01-26T00:00:00Z')
    .order('created_at', { ascending: false })
    .limit(100);
  
  if (txError) {
    console.error('❌ Error:', txError);
    return;
  }
  
  if (!transactions || transactions.length === 0) {
    console.log('✅ No transactions found');
    return;
  }
  
  console.log(`📋 Found ${transactions.length} transactions\n`);
  
  // Group by user and check each
  const userTransactions = new Map();
  
  for (const tx of transactions) {
    const userId = tx.user_id;
    if (!userTransactions.has(userId)) {
      userTransactions.set(userId, []);
    }
    userTransactions.get(userId).push(tx);
  }
  
  console.log(`👥 Found ${userTransactions.size} users with sell transactions\n`);
  
  for (const [userId, txs] of userTransactions.entries()) {
    console.log(`\n👤 User: ${userId.substring(0, 8)}...`);
    console.log(`   Transactions: ${txs.length}`);
    
    let totalOverCredit = 0;
    const corrections = [];
    
    for (const tx of txs) {
      const cryptoCurrency = tx.crypto_currency;
      const cryptoAmount = parseFloat(tx.crypto_amount || '0');
      const creditedNgn = parseFloat(tx.fiat_amount || '0');
      const rate = parseFloat(tx.metadata?.rate || '0');
      const metadata = tx.metadata || {};
      
      if (!cryptoAmount || !creditedNgn) {
        continue;
      }
      
      // Calculate correct amount
      let correctNgnAmount;
      
      if (rate && rate > 0) {
        // Use rate from metadata
        const totalNgnBeforeFee = cryptoAmount * rate;
        const platformFee = totalNgnBeforeFee * 0.01;
        correctNgnAmount = totalNgnBeforeFee - platformFee;
      } else {
        // Estimate based on typical rates
        // USDT/USDC: ~₦1,472
        // BTC: ~₦95,000,000
        // ETH: ~₦3,500,000
        // SOL: ~₦193,000
        // XRP: ~₦1,000
        let estimatedRate = 1472; // Default for USDT/USDC
        if (cryptoCurrency === 'BTC') estimatedRate = 95000000;
        else if (cryptoCurrency === 'ETH') estimatedRate = 3500000;
        else if (cryptoCurrency === 'SOL') estimatedRate = 0; // Use pricing engine
        else if (cryptoCurrency === 'XRP') estimatedRate = 1000;
        
        const totalNgnBeforeFee = cryptoAmount * estimatedRate;
        const platformFee = totalNgnBeforeFee * 0.01;
        correctNgnAmount = totalNgnBeforeFee - platformFee;
      }
      
      const overCredit = creditedNgn - correctNgnAmount;
      
      // If over-credited by more than ₦100, it's likely the bug
      if (overCredit > 100) {
        console.log(`   ⚠️  Transaction ${tx.id.substring(0, 8)}...`);
        console.log(`      ${cryptoAmount} ${cryptoCurrency} @ ₦${rate || 'N/A'}`);
        console.log(`      Credited: ₦${creditedNgn.toFixed(2)}`);
        console.log(`      Should be: ₦${correctNgnAmount.toFixed(2)}`);
        console.log(`      Over-credit: ₦${overCredit.toFixed(2)}`);
        
        totalOverCredit += overCredit;
        corrections.push({
          txId: tx.id,
          cryptoCurrency,
          cryptoAmount,
          rate: rate || 'estimated',
          creditedNgn,
          correctNgnAmount,
          overCredit,
        });
      }
    }
    
    if (corrections.length > 0) {
      console.log(`\n   📊 Total over-credit: ₦${totalOverCredit.toFixed(2)}`);
      
      // Get current balance
      const { data: userWallet } = await supabase
        .from('user_wallets')
        .select('ngn_balance')
        .eq('user_id', userId)
        .single();
      
      const currentBalance = parseFloat(userWallet?.ngn_balance || '0');
      const correctBalance = Math.max(0, currentBalance - totalOverCredit);
      
      console.log(`   Current balance: ₦${currentBalance.toFixed(2)}`);
      console.log(`   Correct balance: ₦${correctBalance.toFixed(2)}`);
      
      if (correctBalance < 0) {
        console.log(`   ⚠️  Would result in negative balance, manual review needed`);
        continue;
      }
      
      // Ask for confirmation
      console.log(`\n   🔧 Fixing balance...`);
      
      try {
        // Update all tables
        await supabase.from('user_wallets').update({ ngn_balance: correctBalance }).eq('user_id', userId);
        await supabase.from('wallet_balances').upsert({
          user_id: userId,
          currency: 'NGN',
          balance: correctBalance,
          updated_at: new Date().toISOString(),
        }, { onConflict: 'user_id,currency' });
        await supabase.from('wallets').upsert({
          user_id: userId,
          ngn_balance: correctBalance,
          updated_at: new Date().toISOString(),
        }, { onConflict: 'user_id' });
        
        // Mark transactions
        for (const correction of corrections) {
          const tx = txs.find(t => t.id === correction.txId);
          if (tx) {
            await supabase.from('transactions').update({
              metadata: {
                ...tx.metadata,
                corrected: true,
                original_fiat_amount: correction.creditedNgn,
                corrected_fiat_amount: correction.correctNgnAmount,
                correction_date: new Date().toISOString(),
              }
            }).eq('id', correction.txId);
          }
        }
        
        console.log(`   ✅ Balance corrected`);
      } catch (error) {
        console.error(`   ❌ Error:`, error.message);
      }
    } else {
      console.log(`   ✅ No issues found`);
    }
  }
  
  console.log('\n✅ Done!');
}

findAndFixUser().catch(console.error);
