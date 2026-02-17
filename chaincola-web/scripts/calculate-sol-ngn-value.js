const { createClient } = require('@supabase/supabase-js');
require('dotenv').config({ path: '.env.local' });

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

const USER_ID = 'f04afc9d-8cde-40dd-b78d-094369aab856';

async function calculateSolNgnValue() {
  try {
    // Get SOL balance
    const { data: balanceData, error: balanceError } = await supabase
      .from('wallet_balances')
      .select('balance')
      .eq('user_id', USER_ID)
      .eq('currency', 'SOL')
      .single();

    if (balanceError) {
      console.error('Error fetching balance:', balanceError);
      return;
    }

    const balance = parseFloat(balanceData?.balance || 0);
    console.log('\n📊 SOL Balance Information:');
    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
    console.log(`SOL Balance: ${balance} SOL`);
    console.log(`SOL Balance (formatted): ${balance.toFixed(8)} SOL`);

    // Try to get admin-set price
    const { data: adminRate, error: adminError } = await supabase
      .rpc('get_active_crypto_rate', { p_crypto_symbol: 'SOL' });

    let priceNGN = 0;
    let priceUSD = 0;
    let priceSource = '';

    if (!adminError && adminRate && adminRate.length > 0) {
      priceUSD = parseFloat(adminRate[0].price_usd.toString());
      const priceNgnRaw = parseFloat(adminRate[0].price_ngn.toString());
      
      // Check if price_ngn is exchange rate (1000-2000 range)
      if (priceNgnRaw >= 1000 && priceNgnRaw <= 2000) {
        priceNGN = priceUSD * priceNgnRaw;
      } else {
        priceNGN = priceNgnRaw;
      }
      priceSource = 'Admin-set rate';
    } else {
      // Estimate based on current market (SOL is around $140-150 USD, NGN rate ~1650)
      priceUSD = 145; // Approximate USD price
      priceNGN = priceUSD * 1650; // Approximate NGN price
      priceSource = 'Estimated (market rate)';
    }

    const ngnValue = balance * priceNGN;

    console.log('\n💰 Price Information:');
    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
    console.log(`Price Source: ${priceSource}`);
    console.log(`SOL Price (USD): $${priceUSD.toFixed(2)}`);
    console.log(`SOL Price (NGN): ₦${priceNGN.toFixed(2)}`);

    console.log('\n💵 NGN Value Calculation:');
    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
    console.log(`Calculation: ${balance} SOL × ₦${priceNGN.toFixed(2)} = ₦${ngnValue.toFixed(8)}`);
    console.log(`\n🎯 Your SOL balance is worth:`);
    console.log(`   ₦${ngnValue.toFixed(8)} NGN`);
    console.log(`   ₦${ngnValue.toFixed(2)} NGN (rounded)`);
    console.log(`   ₦${ngnValue.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 8 })} NGN (formatted)`);
    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n');

  } catch (error) {
    console.error('Error:', error);
  }
}

calculateSolNgnValue().catch(console.error);
