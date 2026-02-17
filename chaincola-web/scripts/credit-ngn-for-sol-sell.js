const { createClient } = require('@supabase/supabase-js');
require('dotenv').config({ path: '.env.local' });

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || 'https://slleojsdpctxhlsoyenr.supabase.co';
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY || 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InNsbGVvanNkcGN0eGhsc295ZW5yIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc2NjE2NTk5MSwiZXhwIjoyMDgxNzQxOTkxfQ.Tx3O8EyKK3ZqcJef2CloZI4RTmDY9Ab59SXBgmubBsA';

const supabase = createClient(supabaseUrl, supabaseServiceKey);

async function creditNGNForSell() {
  try {
    const email = 'worldgistmedia14@gmail.com';
    const sellId = '50009476-6b2f-4e9b-ae41-1ea4814086f5';
    
    console.log(`💰 Crediting NGN for SOL sell\n`);
    console.log(`📋 Sell ID: ${sellId}\n`);
    
    // Get sell order
    const { data: sellOrder, error: orderError } = await supabase
      .from('sells')
      .select('*')
      .eq('sell_id', sellId)
      .single();
    
    if (orderError || !sellOrder) {
      console.error('❌ Sell order not found:', orderError);
      return;
    }
    
    console.log(`✅ Sell order:`);
    console.log(`   Status: ${sellOrder.status}`);
    console.log(`   SOL Amount: ${sellOrder.sol_amount}`);
    console.log(`   SOL TX Hash: ${sellOrder.sol_tx_hash}\n`);
    
    // Get auth user ID
    const { data: authUsers } = await supabase.auth.admin.listUsers();
    const authUser = authUsers?.users?.find(u => u.email === email);
    if (!authUser) {
      console.error('❌ User not found');
      return;
    }
    
    const userId = authUser.id;
    const solAmount = parseFloat(sellOrder.sol_amount || '0');
    
    // Get current SOL price in NGN (approximate)
    // Using CoinGecko API for current price
    console.log(`📊 Fetching SOL price...`);
    let solPriceNGN = 0;
    
    try {
      const priceResponse = await fetch('https://api.coingecko.com/api/v3/simple/price?ids=solana&vs_currencies=ngn');
      if (priceResponse.ok) {
        const priceData = await priceResponse.json();
        solPriceNGN = priceData.solana?.ngn || 0;
      }
    } catch (err) {
      console.warn('⚠️ Failed to fetch price from CoinGecko, using fallback');
    }
    
    // Fallback price if API fails (approximate SOL price in NGN)
    if (!solPriceNGN || solPriceNGN <= 0) {
      solPriceNGN = 430000; // Approximate SOL price in NGN (~$260 * 1650)
      console.log(`⚠️ Using fallback price: ₦${solPriceNGN.toFixed(2)} per SOL`);
    } else {
      console.log(`✅ SOL price: ₦${solPriceNGN.toFixed(2)} per SOL\n`);
    }
    
    // Calculate NGN received
    const totalNGN = solAmount * solPriceNGN;
    const platformFee = totalNGN * 0.03; // 3% platform fee
    const finalNGNPayout = totalNGN - platformFee;
    
    console.log(`💰 Calculation:`);
    console.log(`   SOL Amount: ${solAmount} SOL`);
    console.log(`   SOL Price: ₦${solPriceNGN.toFixed(2)}`);
    console.log(`   Total NGN: ₦${totalNGN.toFixed(2)}`);
    console.log(`   Platform Fee (3%): ₦${platformFee.toFixed(2)}`);
    console.log(`   Final Payout: ₦${finalNGNPayout.toFixed(2)}\n`);
    
    // Get current NGN balance from BOTH tables to ensure we don't lose existing balance
    const { data: ngnBalance } = await supabase
      .from('wallet_balances')
      .select('balance')
      .eq('user_id', userId)
      .eq('currency', 'NGN')
      .single();
    
    const { data: wallet } = await supabase
      .from('wallets')
      .select('ngn_balance')
      .eq('user_id', userId)
      .single();
    
    // Use the higher balance from either table to ensure we don't lose funds
    const balanceFromWalletBalances = ngnBalance ? parseFloat(ngnBalance.balance || '0') : 0;
    const balanceFromWallets = wallet ? parseFloat(wallet.ngn_balance || '0') : 0;
    const currentNgnBalance = Math.max(balanceFromWalletBalances, balanceFromWallets);
    
    const newNgnBalance = currentNgnBalance + finalNGNPayout;
    
    console.log(`💰 Current NGN Balance:`);
    console.log(`   wallet_balances: ₦${balanceFromWalletBalances.toFixed(2)}`);
    console.log(`   wallets: ₦${balanceFromWallets.toFixed(2)}`);
    console.log(`   Using: ₦${currentNgnBalance.toFixed(2)}`);
    console.log(`💰 New NGN Balance: ₦${newNgnBalance.toFixed(2)}\n`);
    
    // Update wallet_balances
    console.log(`📝 Updating wallet_balances...`);
    const { error: updateError } = await supabase
      .from('wallet_balances')
      .upsert({
        user_id: userId,
        currency: 'NGN',
        balance: newNgnBalance.toFixed(2),
        updated_at: new Date().toISOString(),
      }, {
        onConflict: 'user_id,currency',
      });
    
    if (updateError) {
      console.error(`❌ Failed to update wallet_balances:`, updateError);
      return;
    }
    
    console.log(`✅ Updated wallet_balances: ₦${newNgnBalance.toFixed(2)}`);
    
    // Update wallets table
    console.log(`📝 Updating wallets table...`);
    const { data: wallet } = await supabase
      .from('wallets')
      .select('ngn_balance')
      .eq('user_id', userId)
      .single();
    
    if (!wallet) {
      // Create wallet
      const { error: createError } = await supabase.from('wallets').insert({
        user_id: userId,
        ngn_balance: newNgnBalance.toFixed(2),
        usd_balance: 0,
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      });
      
      if (createError) {
        console.error(`⚠️ Failed to create wallet:`, createError);
      } else {
        console.log(`✅ Created wallet with NGN balance: ₦${newNgnBalance.toFixed(2)}`);
      }
    } else {
      const { error: updateWalletError } = await supabase.from('wallets').update({
        ngn_balance: newNgnBalance.toFixed(2),
        updated_at: new Date().toISOString(),
      }).eq('user_id', userId);
      
      if (updateWalletError) {
        console.error(`⚠️ Failed to update wallet:`, updateWalletError);
      } else {
        console.log(`✅ Updated wallets.ngn_balance: ₦${newNgnBalance.toFixed(2)}`);
      }
    }
    
    // Update sell order
    console.log(`📝 Updating sell order to COMPLETED...`);
    const { error: sellUpdateError } = await supabase.from('sells').update({
      status: 'COMPLETED',
      ngn_received: totalNGN.toFixed(2),
      metadata: {
        ...(sellOrder.metadata || {}),
        execution_price: solPriceNGN.toFixed(2),
        platform_fee: platformFee.toFixed(2),
        final_payout: finalNGNPayout.toFixed(2),
        source: 'manual-credit-ngn',
      },
    }).eq('sell_id', sellId);
    
    if (sellUpdateError) {
      console.error(`⚠️ Failed to update sell order:`, sellUpdateError);
    } else {
      console.log(`✅ Updated sell order to COMPLETED`);
    }
    
    // Record NGN credit transaction
    console.log(`📝 Recording NGN credit transaction...`);
    const { error: txError } = await supabase.from('transactions').insert({
      user_id: userId,
      transaction_type: 'SELL',
      crypto_currency: 'SOL',
      crypto_amount: solAmount.toString(),
      fiat_amount: finalNGNPayout.toFixed(2),
      fiat_currency: 'NGN',
      status: 'COMPLETED',
      fee_amount: platformFee.toFixed(2),
      fee_currency: 'NGN',
      metadata: {
        sell_id: sellId,
        total_ngn: totalNGN.toFixed(2),
        platform_fee: platformFee.toFixed(2),
        execution_price: solPriceNGN.toFixed(2),
        source: 'manual-credit-ngn',
      },
    });
    
    if (txError) {
      console.error(`⚠️ Failed to record transaction:`, txError);
    } else {
      console.log(`✅ Recorded NGN credit transaction`);
    }
    
    // Update existing SELL transaction if exists
    const solTxHash = sellOrder.sol_tx_hash;
    if (solTxHash) {
      const { data: sellTx } = await supabase
        .from('transactions')
        .select('id')
        .eq('user_id', userId)
        .or(`transaction_hash.eq.${solTxHash},metadata->>sell_id.eq.${sellId}`)
        .eq('transaction_type', 'SELL')
        .eq('crypto_currency', 'SOL')
        .limit(1);
      
      if (sellTx && sellTx.length > 0) {
        const { error: updateTxError } = await supabase.from('transactions').update({
          status: 'COMPLETED',
          fiat_amount: finalNGNPayout.toFixed(2),
          fiat_currency: 'NGN',
          fee_amount: platformFee.toFixed(2),
          fee_currency: 'NGN',
        }).eq('id', sellTx[0].id);
        
        if (updateTxError) {
          console.error(`⚠️ Failed to update transaction:`, updateTxError);
        } else {
          console.log(`✅ Updated SELL transaction to COMPLETED`);
        }
      }
    }
    
    console.log(`\n✅ Done! NGN credited successfully.`);
    console.log(`\n📊 Summary:`);
    console.log(`   SOL Sold: ${solAmount} SOL`);
    console.log(`   NGN Credited: ₦${finalNGNPayout.toFixed(2)}`);
    console.log(`   Platform Fee: ₦${platformFee.toFixed(2)}`);
    console.log(`   New NGN Balance: ₦${newNgnBalance.toFixed(2)}`);
    
  } catch (error) {
    console.error('❌ Error:', error.message);
    console.error(error);
  }
}

creditNGNForSell();

