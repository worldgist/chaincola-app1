/**
 * Fix Missing NGN Credits for Successful Solana Sales
 * 
 * This script finds all users who successfully sold Solana (SOL debited)
 * but didn't receive NGN credit, and fixes the issue by:
 * 1. Finding successful SOL sells without NGN credit
 * 2. Calculating the correct NGN amount based on SOL price
 * 3. Crediting NGN to both wallet_balances and wallets tables
 * 4. Creating proper transaction records
 */

const { createClient } = require('@supabase/supabase-js');
require('dotenv').config({ path: '.env.local' });

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || 'https://slleojsdpctxhlsoyenr.supabase.co';
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY || 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InNsbGVvanNkcGN0eGhsc295ZW5yIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc2NjE2NTk5MSwiZXhwIjoyMDgxNzQxOTkxfQ.Tx3O8EyKK3ZqcJef2CloZI4RTmDY9Ab59SXBgmubBsA';

const supabase = createClient(supabaseUrl, supabaseServiceKey);

async function fixMissingNGNCredits() {
  try {
    console.log(`\n🔍 Finding successful SOL sells without NGN credit...\n`);
    
    // Find all SOL sells that are COMPLETED, SOL_SENT, or SOLD_ON_LUNO
    // but don't have a corresponding COMPLETED transaction with NGN credit
    const { data: sells, error: sellsError } = await supabase
      .from('sells')
      .select('*')
      .eq('crypto_currency', 'SOL')
      .not('sol_amount', 'is', null)
      .in('status', ['COMPLETED', 'SOL_SENT', 'SOLD_ON_LUNO'])
      .order('created_at', { ascending: false })
      .limit(100);
    
    if (sellsError) {
      console.error('❌ Error fetching sells:', sellsError);
      return;
    }
    
    if (!sells || sells.length === 0) {
      console.log('✅ No SOL sells found');
      return;
    }
    
    console.log(`📋 Found ${sells.length} SOL sells to check\n`);
    
    let fixedCount = 0;
    let alreadyCreditedCount = 0;
    let errorCount = 0;
    
    for (const sell of sells) {
      try {
        console.log(`\n${'='.repeat(70)}`);
        console.log(`Sell ID: ${sell.sell_id}`);
        console.log(`User ID: ${sell.user_id}`);
        console.log(`Status: ${sell.status}`);
        console.log(`SOL Amount: ${sell.sol_amount}`);
        console.log(`SOL TX Hash: ${sell.sol_tx_hash || 'N/A'}`);
        console.log(`NGN Received (from sell): ${sell.ngn_received || 'N/A'}`);
        
        // Check if NGN was already credited by looking for COMPLETED transaction with NGN
        const { data: ngnTx } = await supabase
          .from('transactions')
          .select('*')
          .eq('user_id', sell.user_id)
          .eq('transaction_type', 'SELL')
          .eq('status', 'COMPLETED')
          .eq('crypto_currency', 'SOL')
          .not('fiat_amount', 'is', null)
          .eq('fiat_currency', 'NGN')
          .or(`metadata->>sell_id.eq.${sell.sell_id},transaction_hash.eq.${sell.sol_tx_hash || 'none'}`)
          .limit(1);
        
        if (ngnTx && ngnTx.length > 0) {
          console.log(`✅ NGN already credited: ₦${ngnTx[0].fiat_amount}`);
          alreadyCreditedCount++;
          continue;
        }
        
        // NGN not credited - need to fix
        console.log(`⚠️ NGN NOT credited - fixing...`);
        
        const solAmount = parseFloat(sell.sol_amount || '0');
        if (solAmount <= 0) {
          console.log(`❌ Invalid SOL amount, skipping`);
          errorCount++;
          continue;
        }
        
        // Get SOL price - prefer from sell metadata, then fetch current price
        let solPriceNGN = 0;
        
        if (sell.metadata?.execution_price) {
          solPriceNGN = parseFloat(sell.metadata.execution_price);
          console.log(`💰 Using execution price from metadata: ₦${solPriceNGN.toFixed(2)}`);
        } else if (sell.ngn_received && solAmount > 0) {
          // Calculate from ngn_received if available
          solPriceNGN = parseFloat(sell.ngn_received) / solAmount;
          console.log(`💰 Calculated price from ngn_received: ₦${solPriceNGN.toFixed(2)}`);
        } else {
          // Fetch current price from CoinGecko
          console.log(`📊 Fetching current SOL price...`);
          try {
            const priceResponse = await fetch('https://api.coingecko.com/api/v3/simple/price?ids=solana&vs_currencies=ngn');
            if (priceResponse.ok) {
              const priceData = await priceResponse.json();
              solPriceNGN = priceData.solana?.ngn || 0;
            }
          } catch (err) {
            console.warn('⚠️ Failed to fetch price from CoinGecko');
          }
          
          if (!solPriceNGN || solPriceNGN <= 0) {
            solPriceNGN = 0;
            console.log(`⚠️ No SOL price available (use pricing engine)`);
          } else {
            console.log(`✅ Current SOL price: ₦${solPriceNGN.toFixed(2)}`);
          }
        }
        
        // Calculate NGN amounts
        let totalNGN = 0;
        
        if (sell.ngn_received && parseFloat(sell.ngn_received) > 0) {
          // Use ngn_received from sell order if available
          totalNGN = parseFloat(sell.ngn_received);
          console.log(`💰 Using ngn_received from sell order: ₦${totalNGN.toFixed(2)}`);
        } else {
          // Calculate from SOL amount and price
          totalNGN = solAmount * solPriceNGN;
          console.log(`💰 Calculated total NGN: ₦${totalNGN.toFixed(2)}`);
        }
        
        const platformFee = totalNGN * 0.03; // 3% platform fee
        const finalNGNPayout = totalNGN - platformFee;
        
        console.log(`\n📊 NGN Calculation:`);
        console.log(`   Total NGN: ₦${totalNGN.toFixed(2)}`);
        console.log(`   Platform Fee (3%): ₦${platformFee.toFixed(2)}`);
        console.log(`   Final Payout: ₦${finalNGNPayout.toFixed(2)}`);
        
        // Get current NGN balance from BOTH tables
        const [ngnBalanceResult, walletResult] = await Promise.all([
          supabase
            .from('wallet_balances')
            .select('balance')
            .eq('user_id', sell.user_id)
            .eq('currency', 'NGN')
            .single(),
          supabase
            .from('wallets')
            .select('ngn_balance')
            .eq('user_id', sell.user_id)
            .single(),
        ]);
        
        const balanceFromWalletBalances = 
          (ngnBalanceResult.error && ngnBalanceResult.error.code === 'PGRST116')
            ? 0
            : (ngnBalanceResult.data ? parseFloat(ngnBalanceResult.data.balance || '0') : 0);
        
        const balanceFromWallets =
          (walletResult.error && walletResult.error.code === 'PGRST116')
            ? 0
            : (walletResult.data ? parseFloat(walletResult.data.ngn_balance || '0') : 0);
        
        // Use maximum balance to prevent losing funds
        const currentNgnBalance = Math.max(balanceFromWalletBalances, balanceFromWallets);
        const newNgnBalance = currentNgnBalance + finalNGNPayout;
        
        console.log(`\n💰 Current NGN Balance:`);
        console.log(`   wallet_balances: ₦${balanceFromWalletBalances.toFixed(2)}`);
        console.log(`   wallets: ₦${balanceFromWallets.toFixed(2)}`);
        console.log(`   Using maximum: ₦${currentNgnBalance.toFixed(2)}`);
        console.log(`   Adding: ₦${finalNGNPayout.toFixed(2)}`);
        console.log(`   New balance: ₦${newNgnBalance.toFixed(2)}`);
        
        // Update wallet_balances table
        console.log(`\n📝 Updating wallet_balances...`);
        const { error: updateError } = await supabase
          .from('wallet_balances')
          .upsert({
            user_id: sell.user_id,
            currency: 'NGN',
            balance: newNgnBalance.toFixed(2),
            updated_at: new Date().toISOString(),
          }, {
            onConflict: 'user_id,currency',
          });
        
        if (updateError) {
          console.error(`❌ Failed to update wallet_balances:`, updateError);
          errorCount++;
          continue;
        }
        
        console.log(`✅ Updated wallet_balances`);
        
        // Update wallets table
        console.log(`📝 Updating wallets table...`);
        const { data: wallet, error: walletCheckError } = await supabase
          .from('wallets')
          .select('ngn_balance')
          .eq('user_id', sell.user_id)
          .single();
        
        if (walletCheckError && walletCheckError.code === 'PGRST116') {
          // Wallet doesn't exist, create it
          const { error: createError } = await supabase
            .from('wallets')
            .insert({
              user_id: sell.user_id,
              ngn_balance: newNgnBalance.toFixed(2),
              usd_balance: 0,
              created_at: new Date().toISOString(),
              updated_at: new Date().toISOString(),
            });
          
          if (createError) {
            console.error(`⚠️ Failed to create wallet:`, createError);
          } else {
            console.log(`✅ Created wallet record`);
          }
        } else if (!walletCheckError && wallet) {
          // Wallet exists, update it
          const { error: updateWalletError } = await supabase
            .from('wallets')
            .update({
              ngn_balance: newNgnBalance.toFixed(2),
              updated_at: new Date().toISOString(),
            })
            .eq('user_id', sell.user_id);
          
          if (updateWalletError) {
            console.error(`⚠️ Failed to update wallet:`, updateWalletError);
          } else {
            console.log(`✅ Updated wallets table`);
          }
        }
        
        // Update sell order to COMPLETED if not already
        if (sell.status !== 'COMPLETED') {
          console.log(`📝 Updating sell order to COMPLETED...`);
          const { error: sellUpdateError } = await supabase
            .from('sells')
            .update({
              status: 'COMPLETED',
              ngn_received: totalNGN.toFixed(2),
              completed_at: new Date().toISOString(),
              metadata: {
                ...(sell.metadata || {}),
                execution_price: solPriceNGN.toFixed(2),
                platform_fee: platformFee.toFixed(2),
                final_payout: finalNGNPayout.toFixed(2),
                source: 'fix-missing-ngn-credits',
                fixed_at: new Date().toISOString(),
              },
            })
            .eq('sell_id', sell.sell_id);
          
          if (sellUpdateError) {
            console.error(`⚠️ Failed to update sell order:`, sellUpdateError);
          } else {
            console.log(`✅ Updated sell order to COMPLETED`);
          }
        }
        
        // Create transaction record
        console.log(`📝 Creating transaction record...`);
        const { error: txError } = await supabase
          .from('transactions')
          .insert({
            user_id: sell.user_id,
            transaction_type: 'SELL',
            crypto_currency: 'SOL',
            crypto_amount: solAmount.toString(),
            fiat_amount: finalNGNPayout.toFixed(2),
            fiat_currency: 'NGN',
            status: 'COMPLETED',
            transaction_hash: sell.sol_tx_hash || undefined,
            fee_amount: platformFee.toFixed(2),
            fee_currency: 'NGN',
            external_order_id: sell.luno_order_id || null,
            completed_at: new Date().toISOString(),
            metadata: {
              sell_id: sell.sell_id,
              total_ngn: totalNGN.toFixed(2),
              platform_fee: platformFee.toFixed(2),
              execution_price: solPriceNGN.toFixed(2),
              source: 'fix-missing-ngn-credits',
              fixed_at: new Date().toISOString(),
            },
          });
        
        if (txError) {
          console.error(`⚠️ Failed to create transaction:`, txError);
        } else {
          console.log(`✅ Created transaction record`);
        }
        
        // Update existing SELL transaction if exists (without NGN)
        if (sell.sol_tx_hash) {
          const { data: sellTx } = await supabase
            .from('transactions')
            .select('id')
            .eq('user_id', sell.user_id)
            .or(`transaction_hash.eq.${sell.sol_tx_hash},metadata->>sell_id.eq.${sell.sell_id}`)
            .eq('transaction_type', 'SELL')
            .eq('crypto_currency', 'SOL')
            .limit(1);
          
          if (sellTx && sellTx.length > 0) {
            const existingTx = sellTx[0];
            // Check if it doesn't have NGN credit
            const { data: txDetails } = await supabase
              .from('transactions')
              .select('fiat_amount, fiat_currency')
              .eq('id', existingTx.id)
              .single();
            
            if (!txDetails?.fiat_amount || txDetails.fiat_currency !== 'NGN') {
              const { error: updateTxError } = await supabase
                .from('transactions')
                .update({
                  status: 'COMPLETED',
                  fiat_amount: finalNGNPayout.toFixed(2),
                  fiat_currency: 'NGN',
                  fee_amount: platformFee.toFixed(2),
                  fee_currency: 'NGN',
                  completed_at: new Date().toISOString(),
                  metadata: {
                    sell_id: sell.sell_id,
                    total_ngn: totalNGN.toFixed(2),
                    platform_fee: platformFee.toFixed(2),
                    execution_price: solPriceNGN.toFixed(2),
                    source: 'fix-missing-ngn-credits',
                    fixed_at: new Date().toISOString(),
                  },
                })
                .eq('id', existingTx.id);
              
              if (updateTxError) {
                console.error(`⚠️ Failed to update existing transaction:`, updateTxError);
              } else {
                console.log(`✅ Updated existing transaction`);
              }
            }
          }
        }
        
        console.log(`\n✅ Successfully credited NGN: ₦${finalNGNPayout.toFixed(2)}`);
        fixedCount++;
        
      } catch (error) {
        console.error(`❌ Error processing sell ${sell.sell_id}:`, error.message);
        errorCount++;
      }
    }
    
    console.log(`\n${'='.repeat(70)}`);
    console.log(`📊 Summary:`);
    console.log(`   Total sells checked: ${sells.length}`);
    console.log(`   Already credited: ${alreadyCreditedCount}`);
    console.log(`   Fixed: ${fixedCount}`);
    console.log(`   Errors: ${errorCount}`);
    console.log(`${'='.repeat(70)}\n`);
    
  } catch (error) {
    console.error('❌ Error:', error.message);
    console.error(error);
  }
}

// Run the fix
fixMissingNGNCredits();
