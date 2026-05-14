#!/usr/bin/env node

/**
 * Calculate Expected SOL Inventory Value in NGN
 * 
 * This script calculates the value of the expected SOL inventory (from transactions)
 * and shows what it's worth in NGN
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

async function calculateSolExpectedValue() {
  try {
    console.log('🔍 Calculating Expected SOL Inventory Value...\n');

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

    const actualInventory = parseFloat(systemWallet.sol_inventory || 0);

    // 2. Calculate expected inventory from transactions
    const { data: allTransactions, error: txError } = await supabase
      .from('transactions')
      .select('transaction_type, crypto_amount, fiat_amount, created_at')
      .eq('crypto_currency', 'SOL')
      .in('status', ['COMPLETED'])
      .in('transaction_type', ['BUY', 'SELL'])
      .order('created_at', { ascending: true });

    if (txError) {
      console.error('❌ Error fetching transactions:', txError);
      return;
    }

    const totalSold = (allTransactions || [])
      .filter(tx => tx.transaction_type === 'SELL')
      .reduce((sum, tx) => sum + parseFloat(tx.crypto_amount || 0), 0);

    const totalBought = (allTransactions || [])
      .filter(tx => tx.transaction_type === 'BUY')
      .reduce((sum, tx) => sum + parseFloat(tx.crypto_amount || 0), 0);

    const expectedInventory = totalSold - totalBought;
    const discrepancy = actualInventory - expectedInventory;

    console.log('═══════════════════════════════════════════════════════');
    console.log('📊 SOL INVENTORY SUMMARY');
    console.log('═══════════════════════════════════════════════════════\n');
    console.log(`Total SOL Sold:  ${totalSold.toFixed(8)} SOL`);
    console.log(`Total SOL Bought: ${totalBought.toFixed(8)} SOL`);
    console.log(`Expected Inventory: ${expectedInventory.toFixed(8)} SOL`);
    console.log(`Actual Inventory:   ${actualInventory.toFixed(8)} SOL`);
    console.log(`Discrepancy:        ${discrepancy.toFixed(8)} SOL\n`);

    // 3. Get current SOL price
    let solPriceNGN = null;
    let priceSource = 'unknown';

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
      if (solPriceNGN) priceSource = 'crypto_prices';
    }

    if (!solPriceNGN) {
      // Try get-solana-price function
      try {
        const functionUrl = `${supabaseUrl}/functions/v1/get-solana-price`;
        const response = await fetch(functionUrl, {
          method: 'GET',
          headers: {
            'Authorization': `Bearer ${supabaseServiceKey}`,
            'apikey': supabaseServiceKey,
          },
        });

        if (response.ok) {
          const data = await response.json();
          if (data.price && data.price.price_ngn) {
            solPriceNGN = parseFloat(data.price.price_ngn);
            priceSource = data.price.source || 'API';
          }
        }
      } catch (err) {
        console.log('⚠️  Could not fetch live price from function\n');
      }

      // Fallback: Use average from recent transactions
      if (!solPriceNGN && allTransactions && allTransactions.length > 0) {
        const transactionsWithPrice = allTransactions
          .filter(tx => tx.fiat_amount && parseFloat(tx.crypto_amount) > 0)
          .slice(-10); // Last 10 transactions

        if (transactionsWithPrice.length > 0) {
          const prices = transactionsWithPrice.map(tx => 
            parseFloat(tx.fiat_amount) / parseFloat(tx.crypto_amount)
          );
          solPriceNGN = prices.reduce((sum, p) => sum + p, 0) / prices.length;
          priceSource = 'recent transactions average';
        }
      }
    }

    // 4. Calculate values
    console.log('═══════════════════════════════════════════════════════');
    console.log('💵 SOL VALUE IN NAIRA (NGN)');
    console.log('═══════════════════════════════════════════════════════\n');

    if (solPriceNGN) {
      console.log(`💰 Current SOL Price: ₦${solPriceNGN.toLocaleString('en-NG', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`);
      console.log(`   Source: ${priceSource}\n`);

      if (expectedInventory > 0) {
        const expectedValueNGN = expectedInventory * solPriceNGN;
        console.log(`📈 Expected Inventory Value:`);
        console.log(`   ${expectedInventory.toFixed(8)} SOL × ₦${solPriceNGN.toLocaleString('en-NG', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`);
        console.log(`   = ₦${expectedValueNGN.toLocaleString('en-NG', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}\n`);
      }

      if (actualInventory > 0) {
        const actualValueNGN = actualInventory * solPriceNGN;
        console.log(`📊 Actual Inventory Value:`);
        console.log(`   ${actualInventory.toFixed(8)} SOL × ₦${solPriceNGN.toLocaleString('en-NG', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`);
        console.log(`   = ₦${actualValueNGN.toLocaleString('en-NG', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}\n`);
      }

      if (discrepancy !== 0) {
        const discrepancyValueNGN = Math.abs(discrepancy) * solPriceNGN;
        const sign = discrepancy < 0 ? 'Missing' : 'Extra';
        console.log(`⚠️  ${sign} Value:`);
        console.log(`   ${Math.abs(discrepancy).toFixed(8)} SOL × ₦${solPriceNGN.toLocaleString('en-NG', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`);
        console.log(`   = ₦${discrepancyValueNGN.toLocaleString('en-NG', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}\n`);
      }
    } else {
      console.log('⚠️  Could not determine SOL price\n');
      console.log('💡 Recent transaction prices:');
      const recentTx = (allTransactions || [])
        .filter(tx => tx.fiat_amount && parseFloat(tx.crypto_amount) > 0)
        .slice(-5);
      
      recentTx.forEach((tx, idx) => {
        const price = parseFloat(tx.fiat_amount) / parseFloat(tx.crypto_amount);
        console.log(`   ${tx.transaction_type}: ₦${price.toLocaleString('en-NG', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} per SOL`);
      });
      console.log('');
    }

  } catch (error) {
    console.error('❌ Exception:', error);
  }
}

calculateSolExpectedValue()
  .then(() => {
    console.log('✅ Calculation Complete');
    process.exit(0);
  })
  .catch((error) => {
    console.error('❌ Fatal error:', error);
    process.exit(1);
  });
