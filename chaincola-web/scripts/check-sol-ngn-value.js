#!/usr/bin/env node

/**
 * Check SOL Inventory Value in NGN
 * 
 * This script checks the current SOL inventory and calculates its value in NGN
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

async function checkSolNgnValue() {
  try {
    console.log('🔍 Checking SOL Inventory Value in NGN...\n');

    // 1. Get current SOL inventory
    const { data: systemWallet, error: swError } = await supabase
      .from('system_wallets')
      .select('sol_inventory, updated_at')
      .eq('id', 1)
      .single();

    if (swError) {
      console.error('❌ Error fetching system wallet:', swError);
      return;
    }

    const solInventory = parseFloat(systemWallet.sol_inventory || 0);
    console.log(`📦 Current SOL Inventory: ${solInventory.toFixed(8)} SOL`);
    console.log(`   Last Updated: ${new Date(systemWallet.updated_at).toLocaleString()}\n`);

    // 2. Get current SOL price (crypto_prices table, then edge)
    let solPriceNGN = null;

    const { data: cpRow } = await supabase
      .from('crypto_prices')
      .select('price_ngn, bid, ask')
      .eq('crypto_symbol', 'SOL')
      .maybeSingle();

    if (cpRow) {
      const bid = parseFloat(cpRow.bid || 0);
      const ask = parseFloat(cpRow.ask || 0);
      const mid = parseFloat(cpRow.price_ngn || 0);
      if (bid > 0 && ask > 0) solPriceNGN = (bid + ask) / 2;
      else if (mid > 0) solPriceNGN = mid;
      if (solPriceNGN) {
        console.log(`💰 SOL Price (from crypto_prices): ₦${solPriceNGN.toLocaleString('en-NG', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}\n`);
      }
    }

    if (!solPriceNGN) {
      console.log('⚠️  No SOL row in crypto_prices, trying edge get-luno-prices...\n');
      
      // Call get-luno-prices function if available
      try {
        const functionUrl = `${supabaseUrl}/functions/v1/get-luno-prices`;
        const response = await fetch(functionUrl, {
          method: 'POST',
          headers: {
            'Authorization': `Bearer ${supabaseServiceKey}`,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({ asset: 'SOL' }),
        });

        if (response.ok) {
          const data = await response.json();
          if (data.price) {
            solPriceNGN = parseFloat(data.price);
            console.log(`💰 SOL Price (from Luno): ₦${solPriceNGN.toLocaleString('en-NG', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}\n`);
          }
        }
      } catch (err) {
        console.log('⚠️  Could not fetch live price from function\n');
      }
    }

    // 3. Calculate value
    if (solPriceNGN && solInventory > 0) {
      const totalValueNGN = solInventory * solPriceNGN;
      
      console.log('═══════════════════════════════════════════════════════');
      console.log('💵 SOL INVENTORY VALUE');
      console.log('═══════════════════════════════════════════════════════\n');
      console.log(`SOL Inventory: ${solInventory.toFixed(8)} SOL`);
      console.log(`SOL Price: ₦${solPriceNGN.toLocaleString('en-NG', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`);
      console.log(`\n💰 Total Value: ₦${totalValueNGN.toLocaleString('en-NG', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}\n`);
    } else if (solInventory === 0) {
      console.log('═══════════════════════════════════════════════════════');
      console.log('💵 SOL INVENTORY VALUE');
      console.log('═══════════════════════════════════════════════════════\n');
      console.log(`SOL Inventory: 0.00000000 SOL`);
      console.log(`💰 Total Value: ₦0.00\n`);
    } else {
      console.log('⚠️  Could not determine SOL price. Showing inventory only:\n');
      console.log(`SOL Inventory: ${solInventory.toFixed(8)} SOL\n`);
      console.log('💡 To get the NGN value, please ensure:');
      console.log('   1. Pricing engine config is set up for SOL');
      console.log('   2. Or the get-luno-prices function is working\n');
    }

    // 4. Show recent SOL transactions for context
    const { data: recentTransactions, error: txError } = await supabase
      .from('transactions')
      .select('transaction_type, crypto_amount, fiat_amount, created_at')
      .eq('crypto_currency', 'SOL')
      .eq('status', 'COMPLETED')
      .order('created_at', { ascending: false })
      .limit(5);

    if (!txError && recentTransactions && recentTransactions.length > 0) {
      console.log('═══════════════════════════════════════════════════════');
      console.log('📊 RECENT SOL TRANSACTIONS (for price reference)');
      console.log('═══════════════════════════════════════════════════════\n');
      
      recentTransactions.forEach((tx, index) => {
        if (tx.fiat_amount) {
          const impliedPrice = parseFloat(tx.fiat_amount) / parseFloat(tx.crypto_amount);
          console.log(`[${index + 1}] ${new Date(tx.created_at).toLocaleString()}`);
          console.log(`   ${tx.transaction_type}: ${parseFloat(tx.crypto_amount).toFixed(8)} SOL = ₦${parseFloat(tx.fiat_amount).toLocaleString('en-NG', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`);
          console.log(`   Implied Price: ₦${impliedPrice.toLocaleString('en-NG', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} per SOL\n`);
        }
      });
    }

  } catch (error) {
    console.error('❌ Exception:', error);
  }
}

checkSolNgnValue()
  .then(() => {
    console.log('✅ Check Complete');
    process.exit(0);
  })
  .catch((error) => {
    console.error('❌ Fatal error:', error);
    process.exit(1);
  });
