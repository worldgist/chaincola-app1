const { createClient } = require('@supabase/supabase-js');
require('dotenv').config({ path: '.env.local' });

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || 'https://slleojsdpctxhlsoyenr.supabase.co';
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY || 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InNsbGVvanNkcGN0eGhsc295ZW5yIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc2NjE2NTk5MSwiZXhwIjoyMDgxNzQxOTkxfQ.Tx3O8EyKK3ZqcJef2CloZI4RTmDY9Ab59SXBgmubBsA';

const supabase = createClient(supabaseUrl, supabaseServiceKey);

async function checkSuccessfulSellsNoNGN() {
  try {
    const userId = '2fbdf270-d641-403b-86e2-81a285d82e4a'; // worldgistmedia14@gmail.com
    
    console.log(`🔍 Checking for successful sells without NGN credit...\n`);
    
    // Get SOL_SENT or COMPLETED sells
    const { data: sells, error: sellsError } = await supabase
      .from('sells')
      .select('*')
      .eq('user_id', userId)
      .not('sol_amount', 'is', null)
      .in('status', ['SOL_SENT', 'COMPLETED', 'SOLD_ON_LUNO'])
      .order('created_at', { ascending: false })
      .limit(10);
    
    if (sellsError) {
      console.error('❌ Error fetching sells:', sellsError);
      return;
    }
    
    if (!sells || sells.length === 0) {
      console.log('✅ No SOL_SENT/COMPLETED sells found');
      return;
    }
    
    console.log(`📋 Found ${sells.length} successful sells:\n`);
    
    for (const sell of sells) {
      console.log(`\n${'='.repeat(60)}`);
      console.log(`Sell ID: ${sell.sell_id}`);
      console.log(`Status: ${sell.status}`);
      console.log(`SOL Amount: ${sell.sol_amount}`);
      console.log(`SOL TX Hash: ${sell.sol_tx_hash || 'N/A'}`);
      console.log(`NGN Received: ${sell.ngn_received || 'N/A'}`);
      
      // Check if NGN was credited
      const { data: ngnTx } = await supabase
        .from('transactions')
        .select('*')
        .eq('user_id', userId)
        .eq('transaction_type', 'SELL')
        .eq('status', 'COMPLETED')
        .not('fiat_amount', 'is', null)
        .eq('fiat_currency', 'NGN')
        .or(`metadata->>sell_id.eq.${sell.sell_id},transaction_hash.eq.${sell.sol_tx_hash || 'none'}`)
        .limit(1);
      
      if (ngnTx && ngnTx.length > 0) {
        console.log(`✅ NGN credited: ₦${ngnTx[0].fiat_amount}`);
      } else {
        console.log(`⚠️ NGN NOT credited!`);
        
        // Try to execute the sell
        if (sell.status === 'SOL_SENT' && sell.sol_tx_hash) {
          console.log(`\n📡 Executing sell on Luno...`);
          const functionUrl = `${supabaseUrl}/functions/v1/execute-luno-sell`;
          
          const executeResponse = await fetch(functionUrl, {
            method: 'POST',
            headers: {
              'Authorization': `Bearer ${supabaseServiceKey}`,
              'apikey': supabaseServiceKey,
              'Content-Type': 'application/json',
            },
            body: JSON.stringify({
              sell_id: sell.sell_id,
            }),
          });
          
          if (!executeResponse.ok) {
            const errorText = await executeResponse.text();
            console.error(`❌ Error executing sell: ${executeResponse.status}`, errorText);
          } else {
            const result = await executeResponse.json();
            console.log(`✅ Execute result:`, JSON.stringify(result, null, 2));
          }
        } else if (sell.status === 'COMPLETED' && sell.ngn_received) {
          console.log(`\n💰 Sell is COMPLETED but no transaction found. Creating transaction...`);
          
          // Get SOL price
          const priceResponse = await fetch('https://api.coingecko.com/api/v3/simple/price?ids=solana&vs_currencies=ngn');
          let solPriceNGN = parseFloat(sell.metadata?.execution_price || '0');
          
          if (priceResponse.ok) {
            const priceData = await priceResponse.json();
            solPriceNGN = priceData.solana?.ngn || solPriceNGN;
          }
          
          const totalNGN = parseFloat(sell.ngn_received);
          const platformFee = totalNGN * 0.03;
          const finalNGNPayout = totalNGN - platformFee;
          
          // Credit NGN
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
          
          const balanceFromWalletBalances = ngnBalance ? parseFloat(ngnBalance.balance || '0') : 0;
          const balanceFromWallets = wallet ? parseFloat(wallet.ngn_balance || '0') : 0;
          const currentNgnBalance = Math.max(balanceFromWalletBalances, balanceFromWallets);
          const newNgnBalance = currentNgnBalance + finalNGNPayout;
          
          // Update wallet_balances
          await supabase
            .from('wallet_balances')
            .upsert({
              user_id: userId,
              currency: 'NGN',
              balance: newNgnBalance.toFixed(2),
              updated_at: new Date().toISOString(),
            }, {
              onConflict: 'user_id,currency',
            });
          
          // Update wallets
          if (!wallet) {
            await supabase.from('wallets').insert({
              user_id: userId,
              ngn_balance: newNgnBalance.toFixed(2),
              usd_balance: 0,
              created_at: new Date().toISOString(),
              updated_at: new Date().toISOString(),
            });
          } else {
            await supabase.from('wallets').update({
              ngn_balance: newNgnBalance.toFixed(2),
              updated_at: new Date().toISOString(),
            }).eq('user_id', userId);
          }
          
          // Create transaction
          await supabase.from('transactions').insert({
            user_id: userId,
            transaction_type: 'SELL',
            crypto_currency: 'SOL',
            crypto_amount: sell.sol_amount.toString(),
            fiat_amount: finalNGNPayout.toFixed(2),
            fiat_currency: 'NGN',
            status: 'COMPLETED',
            fee_amount: platformFee.toFixed(2),
            fee_currency: 'NGN',
            transaction_hash: sell.sol_tx_hash || undefined,
            completed_at: new Date().toISOString(),
            metadata: {
              sell_id: sell.sell_id,
              total_ngn: totalNGN.toFixed(2),
              platform_fee: platformFee.toFixed(2),
              execution_price: solPriceNGN.toFixed(2),
              source: 'manual-credit-fix',
            },
          });
          
          console.log(`✅ NGN credited: ₦${finalNGNPayout.toFixed(2)}`);
        }
      }
    }
    
  } catch (error) {
    console.error('❌ Error:', error.message);
    console.error(error);
  }
}

checkSuccessfulSellsNoNGN();

