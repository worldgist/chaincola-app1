const { createClient } = require('@supabase/supabase-js');
require('dotenv').config({ path: '.env.local' });

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || 'https://slleojsdpctxhlsoyenr.supabase.co';
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY || 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InNsbGVvanNkcGN0eGhsc295ZW5yIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc2NjE2NTk5MSwiZXhwIjoyMDgxNzQxOTkxfQ.Tx3O8EyKK3ZqcJef2CloZI4RTmDY9Ab59SXBgmubBsA';

const supabase = createClient(supabaseUrl, supabaseServiceKey);

const LUNO_API_BASE = 'https://api.luno.com';

async function executeSolSell() {
  try {
    const email = 'worldgistmedia14@gmail.com';
    const sellId = '50009476-6b2f-4e9b-ae41-1ea4814086f5'; // From previous output
    
    console.log(`🔍 Executing SOL sell for: ${email}\n`);
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
    
    console.log(`✅ Sell order found:`);
    console.log(`   Status: ${sellOrder.status}`);
    console.log(`   SOL Amount: ${sellOrder.sol_amount}`);
    console.log(`   SOL TX Hash: ${sellOrder.sol_tx_hash}\n`);
    
    if (sellOrder.status !== 'SOL_SENT') {
      console.error(`❌ Sell order is not in SOL_SENT status. Current: ${sellOrder.status}`);
      return;
    }
    
    // Get Luno API credentials from environment or Supabase secrets
    // Note: In production, these should be stored as Supabase secrets
    const lunoApiKeyId = process.env.LUNO_API_KEY_ID || process.env.NEXT_PUBLIC_LUNO_API_KEY_ID;
    const lunoApiSecret = process.env.LUNO_API_SECRET || process.env.NEXT_PUBLIC_LUNO_API_SECRET;
    
    if (!lunoApiKeyId || !lunoApiSecret) {
      console.error('❌ Luno API credentials not configured');
      console.error('   Please set LUNO_API_KEY_ID and LUNO_API_SECRET in your .env.local file');
      console.error('   Or set them as Supabase secrets and update this script to fetch them');
      return;
    }
    
    const lunoAuthHeader = `Basic ${Buffer.from(`${lunoApiKeyId}:${lunoApiSecret}`).toString('base64')}`;
    
    // Check Luno SOL balance
    console.log(`🔍 Checking Luno SOL balance...`);
    const balanceUrl = `${LUNO_API_BASE}/api/1/balance`;
    const balanceResponse = await fetch(balanceUrl, {
      headers: { 'Authorization': lunoAuthHeader },
    });
    
    if (!balanceResponse.ok) {
      const errorText = await balanceResponse.text();
      console.error(`❌ Failed to check Luno balance: ${balanceResponse.status}`, errorText);
      return;
    }
    
    const balanceData = await balanceResponse.json();
    console.log(`📊 Luno balance response:`, JSON.stringify(balanceData, null, 2));
    
    // Find SOL balance
    let lunoSolBalance = 0;
    const solAmount = parseFloat(sellOrder.sol_amount || '0');
    
    if (Array.isArray(balanceData)) {
      const solBalance = balanceData.find(b => 
        b.asset === 'SOL' || b.currency === 'SOL'
      );
      if (solBalance) {
        lunoSolBalance = parseFloat(solBalance.balance || solBalance.available || '0');
        console.log(`✅ Found SOL balance: ${lunoSolBalance} SOL`);
      } else {
        console.log(`⚠️ SOL not found in balance array. Available assets:`, balanceData.map(b => b.asset || b.currency));
      }
    }
    
    console.log(`💰 Luno SOL balance: ${lunoSolBalance} SOL (required: ${solAmount} SOL)\n`);
    
    if (lunoSolBalance < solAmount * 0.99) {
      console.error(`❌ Insufficient SOL on Luno. Available: ${lunoSolBalance}, Required: ${solAmount}`);
      return;
    }
    
    // Update status to SOL_CREDITED_ON_LUNO
    console.log(`📝 Updating sell order status to SOL_CREDITED_ON_LUNO...`);
    await supabase.from('sells').update({ 
      status: 'SOL_CREDITED_ON_LUNO',
      updated_at: new Date().toISOString(),
    }).eq('sell_id', sellId);
    
    // Get market price
    console.log(`📊 Fetching SOL/NGN market price...`);
    const tickerUrl = `${LUNO_API_BASE}/api/1/ticker?pair=SOLNGN`;
    const tickerResponse = await fetch(tickerUrl, {
      headers: { 'Authorization': lunoAuthHeader },
    });
    
    if (!tickerResponse.ok) {
      // Try USD pair if NGN not available
      const tickerUrlUSD = `${LUNO_API_BASE}/api/1/ticker?pair=SOLUSD`;
      const tickerResponseUSD = await fetch(tickerUrlUSD, {
        headers: { 'Authorization': lunoAuthHeader },
      });
      
      if (!tickerResponseUSD.ok) {
        console.error('❌ Failed to fetch market price');
        return;
      }
      
      const tickerDataUSD = await tickerResponseUSD.json();
      const usdPrice = parseFloat(tickerDataUSD.bid || tickerDataUSD.last_trade || '0');
      const ngnRate = 1650; // Approximate USD to NGN rate
      const bidPrice = usdPrice * ngnRate;
      console.log(`✅ Using USD price converted to NGN: ₦${bidPrice.toFixed(2)}`);
    } else {
      const tickerData = await tickerResponse.json();
      const bidPrice = parseFloat(tickerData.bid || tickerData.last_trade || '0');
      console.log(`✅ Market price: ₦${bidPrice.toFixed(2)} per SOL\n`);
    }
    
    const tickerData = tickerResponse.ok ? await tickerResponse.json() : null;
    let bidPrice = 0;
    
    if (tickerData) {
      bidPrice = parseFloat(tickerData.bid || tickerData.last_trade || '0');
    } else {
      // Fallback: use USD price
      const tickerUrlUSD = `${LUNO_API_BASE}/api/1/ticker?pair=SOLUSD`;
      const tickerResponseUSD = await fetch(tickerUrlUSD, {
        headers: { 'Authorization': lunoAuthHeader },
      });
      if (tickerResponseUSD.ok) {
        const tickerDataUSD = await tickerResponseUSD.json();
        const usdPrice = parseFloat(tickerDataUSD.bid || tickerDataUSD.last_trade || '0');
        bidPrice = usdPrice * 1650; // Approximate USD to NGN rate
      }
    }
    
    if (!bidPrice || bidPrice <= 0) {
      console.error('❌ Invalid market price');
      return;
    }
    
    console.log(`💰 Estimated NGN: ₦${(solAmount * bidPrice).toFixed(2)}\n`);
    
    // Place market sell order
    console.log(`📤 Placing market sell order on Luno...`);
    const limitPrice = bidPrice * 0.995; // Slightly below bid
    const formattedVolume = solAmount.toFixed(6);
    const formattedPrice = limitPrice.toFixed(2);
    
    const postOrderUrl = `${LUNO_API_BASE}/api/1/postorder`;
    const orderResponse = await fetch(postOrderUrl, {
      method: 'POST',
      headers: {
        'Authorization': lunoAuthHeader,
        'Content-Type': 'application/x-www-form-urlencoded',
      },
      body: new URLSearchParams({
        pair: 'SOLNGN',
        type: 'SELL',
        volume: formattedVolume,
        price: formattedPrice,
        time_in_force: 'IOC',
      }),
    });
    
    if (!orderResponse.ok) {
      const errorText = await orderResponse.text();
      console.error(`❌ Failed to place sell order: ${orderResponse.status}`, errorText);
      
      // If SOLNGN pair doesn't exist, try SOLUSD
      if (errorText.includes('pair') || errorText.includes('market')) {
        console.log(`\n🔄 Trying SOLUSD pair instead...`);
        const orderResponseUSD = await fetch(postOrderUrl, {
          method: 'POST',
          headers: {
            'Authorization': lunoAuthHeader,
            'Content-Type': 'application/x-www-form-urlencoded',
          },
          body: new URLSearchParams({
            pair: 'SOLUSD',
            type: 'SELL',
            volume: formattedVolume,
            price: (limitPrice / 1650).toFixed(2), // Convert to USD
            time_in_force: 'IOC',
          }),
        });
        
        if (!orderResponseUSD.ok) {
          const errorTextUSD = await orderResponseUSD.text();
          console.error(`❌ Failed to place sell order on SOLUSD: ${errorTextUSD}`);
          return;
        }
        
        const orderDataUSD = await orderResponseUSD.json();
        console.log(`✅ Sell order placed on SOLUSD: ${orderDataUSD.order_id}`);
        
        // Calculate NGN received (USD * NGN rate)
        const usdReceived = parseFloat(orderDataUSD.counter || '0');
        const ngnReceived = usdReceived * 1650;
        
        // Update sell order
        await supabase.from('sells').update({
          status: 'SOLD_ON_LUNO',
          luno_order_id: orderDataUSD.order_id,
          ngn_received: ngnReceived.toFixed(2),
          metadata: {
            ...(sellOrder.metadata || {}),
            execution_price: (ngnReceived / solAmount).toFixed(2),
            luno_order_status: orderDataUSD.status,
            pair_used: 'SOLUSD',
          },
        }).eq('sell_id', sellId);
        
        // Credit NGN
        await creditNGN(sellOrder.user_id, ngnReceived, sellId);
        
        return;
      }
      
      return;
    }
    
    const orderData = await orderResponse.json();
    const lunoOrderId = orderData.order_id;
    
    if (!lunoOrderId) {
      console.error('❌ No order ID returned from Luno');
      return;
    }
    
    console.log(`✅ Sell order placed: ${lunoOrderId}\n`);
    
    // Wait for order execution
    await new Promise(resolve => setTimeout(resolve, 3000));
    
    // Check order status
    console.log(`🔍 Checking order status...`);
    const orderStatusUrl = `${LUNO_API_BASE}/api/1/orders/${lunoOrderId}`;
    const statusResponse = await fetch(orderStatusUrl, {
      headers: { 'Authorization': lunoAuthHeader },
    });
    
    let ngnReceived = 0;
    let executionPrice = bidPrice;
    
    if (statusResponse.ok) {
      const statusData = await statusResponse.json();
      console.log(`📊 Order status:`, JSON.stringify(statusData, null, 2));
      
      const counter = parseFloat(statusData.counter || '0'); // NGN received
      ngnReceived = counter;
      
      if (solAmount > 0) {
        executionPrice = counter / solAmount;
      }
    } else {
      // Fallback: calculate from market price
      ngnReceived = solAmount * bidPrice;
    }
    
    console.log(`💰 NGN Received: ₦${ngnReceived.toFixed(2)}`);
    console.log(`💰 Execution Price: ₦${executionPrice.toFixed(2)} per SOL\n`);
    
    // Update sell order
    console.log(`📝 Updating sell order to SOLD_ON_LUNO...`);
    await supabase.from('sells').update({
      status: 'SOLD_ON_LUNO',
      luno_order_id: lunoOrderId,
      ngn_received: ngnReceived.toFixed(2),
      metadata: {
        ...(sellOrder.metadata || {}),
        execution_price: executionPrice.toFixed(2),
        luno_order_status: orderData.status,
      },
    }).eq('sell_id', sellId);
    
    // Credit NGN
    await creditNGN(sellOrder.user_id, ngnReceived, sellId);
    
    console.log(`\n✅ Sell executed successfully!`);
    
  } catch (error) {
    console.error('❌ Error:', error.message);
    console.error(error);
  }
}

async function creditNGN(userId, ngnReceived, sellId) {
  try {
    console.log(`\n💰 Crediting NGN to user...`);
    
    // Calculate platform fee (3%)
    const platformFee = ngnReceived * 0.03;
    const finalNgnPayout = ngnReceived - platformFee;
    
    console.log(`   Total NGN: ₦${ngnReceived.toFixed(2)}`);
    console.log(`   Platform Fee (3%): ₦${platformFee.toFixed(2)}`);
    console.log(`   Final Payout: ₦${finalNgnPayout.toFixed(2)}\n`);
    
    // Get current NGN balance
    const { data: ngnBalance } = await supabase
      .from('wallet_balances')
      .select('balance')
      .eq('user_id', userId)
      .eq('currency', 'NGN')
      .single();
    
    const currentNgnBalance = ngnBalance ? parseFloat(ngnBalance.balance || '0') : 0;
    const newNgnBalance = currentNgnBalance + finalNgnPayout;
    
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
    
    console.log(`✅ Updated wallets.ngn_balance: ₦${newNgnBalance.toFixed(2)}`);
    
    // Record NGN credit transaction
    console.log(`📝 Recording NGN credit transaction...`);
    const { error: txError } = await supabase.from('transactions').insert({
      user_id: userId,
      transaction_type: 'SELL',
      crypto_currency: 'SOL',
      crypto_amount: parseFloat(sellOrder.sol_amount).toString(),
      fiat_amount: finalNgnPayout.toFixed(2),
      fiat_currency: 'NGN',
      status: 'COMPLETED',
      fee_amount: platformFee.toFixed(2),
      fee_currency: 'NGN',
      metadata: {
        sell_id: sellId,
        total_ngn: ngnReceived.toFixed(2),
        platform_fee: platformFee.toFixed(2),
        source: 'manual-execute-sol-sell',
      },
    });
    
    if (txError) {
      console.error(`⚠️ Failed to record transaction:`, txError);
    } else {
      console.log(`✅ Recorded NGN credit transaction`);
    }
    
    // Update SELL transaction status if exists
    const { data: sellTx } = await supabase
      .from('transactions')
      .select('id')
      .eq('user_id', userId)
      .or(`transaction_hash.eq.${sellOrder.sol_tx_hash},metadata->>sell_id.eq.${sellId}`)
      .eq('transaction_type', 'SELL')
      .eq('crypto_currency', 'SOL')
      .limit(1);
    
    if (sellTx && sellTx.length > 0) {
      await supabase.from('transactions').update({
        status: 'COMPLETED',
        fiat_amount: finalNgnPayout.toFixed(2),
        fiat_currency: 'NGN',
      }).eq('id', sellTx[0].id);
      console.log(`✅ Updated SELL transaction to COMPLETED`);
    }
    
  } catch (error) {
    console.error('❌ Error crediting NGN:', error);
  }
}

executeSolSell();

