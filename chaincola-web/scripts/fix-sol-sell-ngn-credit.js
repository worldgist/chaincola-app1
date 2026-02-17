const { createClient } = require('@supabase/supabase-js');
require('dotenv').config({ path: '.env.local' });

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || 'https://slleojsdpctxhlsoyenr.supabase.co';
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY || 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InNsbGVvanNkcGN0eGhsc295ZW5yIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc2NjE2NTk5MSwiZXhwIjoyMDgxNzQxOTkxfQ.Tx3O8EyKK3ZqcJef2CloZI4RTmDY9Ab59SXBgmubBsA';

const supabase = createClient(supabaseUrl, supabaseServiceKey);

async function fixSolSellNGNCredit() {
  try {
    const sellId = '43c80b6d-29e0-4d78-8349-046add2a5489';
    
    console.log(`🔍 Fixing SOL sell and crediting NGN: ${sellId}\n`);
    
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
    console.log(`   Metadata:`, JSON.stringify(sellOrder.metadata, null, 2));
    console.log(`   User ID: ${sellOrder.user_id}\n`);
    
    // Check if there's a SEND transaction for this sell
    const { data: sendTx } = await supabase
      .from('transactions')
      .select('*')
      .eq('user_id', sellOrder.user_id)
      .eq('transaction_type', 'SEND')
      .eq('crypto_currency', 'SOL')
      .eq('status', 'COMPLETED')
      .gte('created_at', sellOrder.created_at)
      .order('created_at', { ascending: false })
      .limit(1);
    
    let solTxHash = sellOrder.sol_tx_hash;
    let lunoAddress = null;
    
    if (sendTx && sendTx.length > 0) {
      const tx = sendTx[0];
      solTxHash = tx.transaction_hash;
      lunoAddress = tx.to_address || tx.metadata?.destination_address;
      console.log(`✅ Found SEND transaction:`);
      console.log(`   Hash: ${solTxHash}`);
      console.log(`   To: ${lunoAddress}\n`);
    }
    
    // If no transaction hash, check if SOL was actually sent
    if (!solTxHash && sellOrder.status === 'SOL_SENT') {
      console.log(`⚠️ No transaction hash found but status is SOL_SENT`);
      console.log(`   This might be a failed transaction or the hash wasn't recorded\n`);
    }
    
    // Get SOL price
    console.log(`📊 Fetching SOL price...`);
    const priceResponse = await fetch('https://api.coingecko.com/api/v3/simple/price?ids=solana&vs_currencies=ngn');
    let solPriceNGN = 0;
    
    if (priceResponse.ok) {
      const priceData = await priceResponse.json();
      solPriceNGN = priceData.solana?.ngn || 0;
    }
    
    if (!solPriceNGN || solPriceNGN <= 0) {
      solPriceNGN = 430000; // Fallback
      console.log(`⚠️ Using fallback price: ₦${solPriceNGN.toFixed(2)}`);
    } else {
      console.log(`✅ SOL Price: ₦${solPriceNGN.toFixed(2)}\n`);
    }
    
    const solAmount = parseFloat(sellOrder.sol_amount || '0');
    const totalNGN = solAmount * solPriceNGN;
    const platformFee = totalNGN * 0.03;
    const finalNGNPayout = totalNGN - platformFee;
    
    console.log(`💰 Calculation:`);
    console.log(`   SOL Amount: ${solAmount} SOL`);
    console.log(`   SOL Price: ₦${solPriceNGN.toFixed(2)}`);
    console.log(`   Total NGN: ₦${totalNGN.toFixed(2)}`);
    console.log(`   Platform Fee (3%): ₦${platformFee.toFixed(2)}`);
    console.log(`   Final Payout: ₦${finalNGNPayout.toFixed(2)}\n`);
    
    // Check if NGN was already credited
    const { data: existingNGNTx } = await supabase
      .from('transactions')
      .select('*')
      .eq('user_id', sellOrder.user_id)
      .eq('transaction_type', 'SELL')
      .not('fiat_amount', 'is', null)
      .eq('fiat_currency', 'NGN')
      .or(`metadata->>sell_id.eq.${sellId},transaction_hash.eq.${solTxHash || 'none'}`)
      .limit(1);
    
    if (existingNGNTx && existingNGNTx.length > 0) {
      console.log(`✅ NGN already credited: ₦${existingNGNTx[0].fiat_amount}`);
      return;
    }
    
    // Get current NGN balance from both tables
    const { data: ngnBalance } = await supabase
      .from('wallet_balances')
      .select('balance')
      .eq('user_id', sellOrder.user_id)
      .eq('currency', 'NGN')
      .single();
    
    const { data: wallet } = await supabase
      .from('wallets')
      .select('ngn_balance')
      .eq('user_id', sellOrder.user_id)
      .single();
    
    const balanceFromWalletBalances = ngnBalance ? parseFloat(ngnBalance.balance || '0') : 0;
    const balanceFromWallets = wallet ? parseFloat(wallet.ngn_balance || '0') : 0;
    const currentNgnBalance = Math.max(balanceFromWalletBalances, balanceFromWallets);
    const newNgnBalance = currentNgnBalance + finalNGNPayout;
    
    console.log(`💰 Current NGN Balance:`);
    console.log(`   wallet_balances: ₦${balanceFromWalletBalances.toFixed(2)}`);
    console.log(`   wallets: ₦${balanceFromWallets.toFixed(2)}`);
    console.log(`   Using maximum: ₦${currentNgnBalance.toFixed(2)}`);
    console.log(`   New balance: ₦${newNgnBalance.toFixed(2)}\n`);
    
    // Update wallet_balances
    console.log(`📝 Updating wallet_balances...`);
    const { error: updateError } = await supabase
      .from('wallet_balances')
      .upsert({
        user_id: sellOrder.user_id,
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
    
    console.log(`✅ Updated wallet_balances`);
    
    // Update wallets table
    console.log(`📝 Updating wallets table...`);
    if (!wallet) {
      await supabase.from('wallets').insert({
        user_id: sellOrder.user_id,
        ngn_balance: newNgnBalance.toFixed(2),
        usd_balance: 0,
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      });
    } else {
      await supabase.from('wallets').update({
        ngn_balance: newNgnBalance.toFixed(2),
        updated_at: new Date().toISOString(),
      }).eq('user_id', sellOrder.user_id);
    }
    
    console.log(`✅ Updated wallets table`);
    
    // Update sell order
    console.log(`📝 Updating sell order to COMPLETED...`);
    await supabase.from('sells').update({
      status: 'COMPLETED',
      sol_tx_hash: solTxHash || sellOrder.sol_tx_hash,
      ngn_received: totalNGN.toFixed(2),
      metadata: {
        ...(sellOrder.metadata || {}),
        execution_price: solPriceNGN.toFixed(2),
        platform_fee: platformFee.toFixed(2),
        final_payout: finalNGNPayout.toFixed(2),
        destination_address: lunoAddress,
        source: 'manual-credit-fix',
      },
    }).eq('sell_id', sellId);
    
    console.log(`✅ Updated sell order`);
    
    // Record NGN credit transaction
    console.log(`📝 Recording NGN credit transaction...`);
    await supabase.from('transactions').insert({
      user_id: sellOrder.user_id,
      transaction_type: 'SELL',
      crypto_currency: 'SOL',
      crypto_amount: solAmount.toString(),
      transaction_hash: solTxHash || null,
      fiat_amount: finalNGNPayout.toFixed(2),
      fiat_currency: 'NGN',
      status: 'COMPLETED',
      fee_amount: platformFee.toFixed(2),
      fee_currency: 'NGN',
      to_address: lunoAddress,
      metadata: {
        sell_id: sellId,
        total_ngn: totalNGN.toFixed(2),
        platform_fee: platformFee.toFixed(2),
        execution_price: solPriceNGN.toFixed(2),
        source: 'manual-credit-fix',
      },
    });
    
    console.log(`✅ Recorded transaction`);
    
    // Update existing SELL transaction if exists
    if (solTxHash) {
      const { data: sellTx } = await supabase
        .from('transactions')
        .select('id')
        .eq('user_id', sellOrder.user_id)
        .eq('transaction_hash', solTxHash)
        .eq('transaction_type', 'SELL')
        .eq('crypto_currency', 'SOL')
        .limit(1);
      
      if (sellTx && sellTx.length > 0) {
        await supabase.from('transactions').update({
          status: 'COMPLETED',
          fiat_amount: finalNGNPayout.toFixed(2),
          fiat_currency: 'NGN',
          fee_amount: platformFee.toFixed(2),
          fee_currency: 'NGN',
        }).eq('id', sellTx[0].id);
        console.log(`✅ Updated existing SELL transaction`);
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

fixSolSellNGNCredit();


