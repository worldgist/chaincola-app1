#!/usr/bin/env node

/**
 * Calculate SOL Inventory Value using Alchemy API directly
 * 
 * This script fetches SOL price from Alchemy Prices API and calculates
 * the NGN value of the SOL inventory.
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

// Get USD to NGN exchange rate
async function getUsdToNgnRate() {
  try {
    const response = await fetch('https://api.exchangerate-api.com/v4/latest/USD');
    if (response.ok) {
      const data = await response.json();
      return data.rates?.NGN || 1650; // Fallback rate
    }
  } catch (error) {
    console.warn('⚠️ Failed to fetch USD/NGN rate, using default:', error.message);
  }
  return 1650; // Default fallback rate
}

async function getSolPriceFromAlchemy(alchemyApiKey) {
  try {
    console.log('📡 Fetching SOL price from Alchemy Prices API...');
    const alchemyPricesUrl = `https://api.g.alchemy.com/prices/v1/tokens/by-symbol?symbols=SOL`;
    
    const alchemyResponse = await fetch(alchemyPricesUrl, {
      method: 'GET',
      headers: {
        'Authorization': `Bearer ${alchemyApiKey}`,
        'Accept': 'application/json',
      },
    });

    if (alchemyResponse.ok) {
      const alchemyData = await alchemyResponse.json();
      console.log('📊 Alchemy API response received');
      
      // Parse Alchemy Prices API response
      // Response format: { "data": [{ "symbol": "SOL", "prices": [{ "currency": "USD", "value": "116.66", ... }] }] }
      if (alchemyData.data && Array.isArray(alchemyData.data)) {
        const solData = alchemyData.data.find((item) => item.symbol === 'SOL');
        if (solData && solData.prices && Array.isArray(solData.prices) && solData.prices.length > 0) {
          // Find USD price
          const usdPrice = solData.prices.find((p) => p.currency === 'USD');
          if (usdPrice && usdPrice.value) {
            const priceUSD = parseFloat(usdPrice.value);
            if (!isNaN(priceUSD) && priceUSD > 0) {
              return { priceUSD, source: 'Alchemy Prices API' };
            }
          }
        }
        // Check for error field
        if (solData && solData.error) {
          console.warn(`⚠️ Alchemy API error for SOL: ${solData.error}`);
        }
      }
    } else {
      const errorText = await alchemyResponse.text();
      console.warn(`⚠️ Alchemy API returned error ${alchemyResponse.status}:`, errorText);
    }
  } catch (alchemyError) {
    console.error('❌ Error fetching from Alchemy Prices API:', alchemyError.message);
  }
  
  return null;
}

async function calculateSolValue() {
  try {
    console.log('═══════════════════════════════════════════════════════');
    console.log('💰 SOL INVENTORY VALUE (Alchemy Direct)');
    console.log('═══════════════════════════════════════════════════════\n');

    // Get SOL inventory
    const { data: systemWallet, error: walletError } = await supabase
      .from('system_wallets')
      .select('sol_inventory')
      .eq('id', 1)
      .single();

    if (walletError) {
      console.error('❌ Error fetching system wallet:', walletError);
      return;
    }

    const solAmount = parseFloat(systemWallet?.sol_inventory || 0);
    console.log(`SOL Amount: ${solAmount.toFixed(8)} SOL\n`);

    // Try to get Alchemy API key from environment first
    let alchemyApiKey = process.env.ALCHEMY_API_KEY || process.env.ALCHEMY_SOLANA_API_KEY;
    
    // If not in env, try to get it from Supabase secrets via edge function
    // (We'll use the edge function response to verify, but call Alchemy directly)
    if (!alchemyApiKey) {
      console.log('⚠️  ALCHEMY_API_KEY not found in .env.local');
      console.log('   Attempting to use edge function (which has access to secrets)...\n');
      
      // Call edge function to get price (it has access to secrets)
      const functionUrl = `${supabaseUrl}/functions/v1/get-solana-price`;
      const response = await fetch(functionUrl, {
        method: 'GET',
        headers: {
          'Authorization': `Bearer ${supabaseServiceKey}`,
          'Content-Type': 'application/json',
        },
      });

      if (response.ok) {
        const data = await response.json();
        if (data.success && data.price) {
          const priceNGN = parseFloat(data.price.price_ngn);
          const priceUSD = parseFloat(data.price.price_usd);
          const value = solAmount * priceNGN;
          
          console.log(`Price Source: ${data.price.source}`);
          console.log(`SOL Price (USD): $${priceUSD.toFixed(2)}`);
          console.log(`SOL Price (NGN): ₦${priceNGN.toLocaleString('en-NG', {minimumFractionDigits: 2, maximumFractionDigits: 2})}`);
          console.log(`\n💵 Total Value: ₦${value.toLocaleString('en-NG', {minimumFractionDigits: 2, maximumFractionDigits: 2})}`);
          console.log('═══════════════════════════════════════════════════════');
          return;
        }
      }
      
      console.error('❌ Could not get price from edge function');
      console.log('\n💡 To use Alchemy directly, add ALCHEMY_API_KEY to .env.local');
      console.log('   Or ensure the edge function has access to the secret in Supabase');
      return;
    }

    // Call Alchemy directly
    const alchemyResult = await getSolPriceFromAlchemy(alchemyApiKey);
    
    if (!alchemyResult) {
      console.error('❌ Failed to get price from Alchemy API');
      return;
    }

    const { priceUSD, source } = alchemyResult;
    
    // Get USD to NGN exchange rate
    const usdToNgnRate = await getUsdToNgnRate();
    const priceNGN = priceUSD * usdToNgnRate;
    const value = solAmount * priceNGN;

    console.log(`Price Source: ${source}`);
    console.log(`SOL Price (USD): $${priceUSD.toFixed(2)}`);
    console.log(`USD/NGN Rate: ${usdToNgnRate.toFixed(2)}`);
    console.log(`SOL Price (NGN): ₦${priceNGN.toLocaleString('en-NG', {minimumFractionDigits: 2, maximumFractionDigits: 2})}`);
    console.log(`\n💵 Total Value: ₦${value.toLocaleString('en-NG', {minimumFractionDigits: 2, maximumFractionDigits: 2})}`);
    console.log('═══════════════════════════════════════════════════════');

  } catch (error) {
    console.error('❌ Exception:', error);
  }
}

calculateSolValue()
  .then(() => {
    process.exit(0);
  })
  .catch((error) => {
    console.error('❌ Fatal error:', error);
    process.exit(1);
  });
