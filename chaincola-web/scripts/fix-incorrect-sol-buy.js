/**
 * Fix incorrect Solana balance from buy transaction
 * User bought SOL for ₦2984.05 but received incorrect amount (recorded as USD instead of NGN)
 * This script will:
 * 1. Find the incorrect transaction
 * 2. Calculate correct SOL amount based on NGN paid
 * 3. Adjust user's SOL balance
 * 4. Update transaction record
 */

const { createClient } = require('@supabase/supabase-js');
require('dotenv').config({ path: '.env.local' });

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || 'https://slleojsdpctxhlsoyenr.supabase.co';
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!supabaseServiceKey) {
  console.error('❌ SUPABASE_SERVICE_ROLE_KEY not found in environment variables');
  process.exit(1);
}

const supabase = createClient(supabaseUrl, supabaseServiceKey);

async function fixIncorrectSolBuy() {
  try {
    console.log('🔍 Finding incorrect SOL buy transaction...\n');
    
    // Find recent BUY transactions for SOL with fiat_amount around 2984.05
    // or transactions where fiat_currency might be USD instead of NGN
    const { data: transactions, error: txError } = await supabase
      .from('transactions')
      .select('*')
      .eq('transaction_type', 'BUY')
      .eq('crypto_currency', 'SOL')
      .eq('status', 'COMPLETED')
      .order('created_at', { ascending: false })
      .limit(10);

    if (txError) {
      console.error('❌ Error fetching transactions:', txError);
      return;
    }

    if (!transactions || transactions.length === 0) {
      console.log('⚠️ No recent SOL buy transactions found');
      return;
    }

    console.log(`📋 Found ${transactions.length} recent SOL buy transactions\n`);

    // Find the transaction with amount around 2984.05
    let targetTransaction = null;
    for (const tx of transactions) {
      const fiatAmount = parseFloat(tx.fiat_amount || 0);
      const cryptoAmount = parseFloat(tx.crypto_amount || 0);
      
      // Check if this matches the problematic transaction
      // Either fiat_amount is around 2984.05, or crypto_amount is unusually high (around $261 worth)
      if (
        (Math.abs(fiatAmount - 2984.05) < 10) || 
        (cryptoAmount > 1.0 && tx.fiat_currency === 'USD') ||
        (cryptoAmount > 0.015 && fiatAmount < 3000) // If SOL amount is high but NGN is low
      ) {
        targetTransaction = tx;
        console.log('🎯 Found target transaction:');
        console.log(`   Transaction ID: ${tx.id}`);
        console.log(`   User ID: ${tx.user_id}`);
        console.log(`   Fiat Amount: ${fiatAmount} ${tx.fiat_currency || 'NGN'}`);
        console.log(`   Crypto Amount: ${cryptoAmount} SOL`);
        console.log(`   Created At: ${tx.created_at}\n`);
        break;
      }
    }

    if (!targetTransaction) {
      console.log('⚠️ Could not find the specific transaction. Showing all recent transactions:\n');
      transactions.forEach((tx, idx) => {
        console.log(`${idx + 1}. Transaction ID: ${tx.id}`);
        console.log(`   User: ${tx.user_id}`);
        console.log(`   Fiat: ${tx.fiat_amount} ${tx.fiat_currency || 'NGN'}`);
        console.log(`   Crypto: ${tx.crypto_amount} SOL`);
        console.log(`   Date: ${tx.created_at}\n`);
      });
      
      // Ask user to specify transaction ID
      const readline = require('readline');
      const rl = readline.createInterface({
        input: process.stdin,
        output: process.stdout
      });

      return new Promise((resolve) => {
        rl.question('Enter the transaction ID to fix (or press Enter to exit): ', async (txId) => {
          rl.close();
          if (!txId) {
            console.log('Exiting...');
            resolve();
            return;
          }
          await fixSpecificTransaction(txId);
          resolve();
        });
      });
    }

    await fixSpecificTransaction(targetTransaction.id, targetTransaction.user_id);

  } catch (error) {
    console.error('❌ Error:', error);
  }
}

async function fixSpecificTransaction(transactionId, userId = null) {
  try {
    console.log(`\n🔧 Fixing transaction: ${transactionId}\n`);

    // Get transaction details
    const { data: transaction, error: txError } = await supabase
      .from('transactions')
      .select('*')
      .eq('id', transactionId)
      .single();

    if (txError || !transaction) {
      console.error('❌ Transaction not found:', txError);
      return;
    }

    if (!userId) {
      userId = transaction.user_id;
    }

    const fiatAmount = parseFloat(transaction.fiat_amount || 0);
    const cryptoAmount = parseFloat(transaction.crypto_amount || 0);
    const fiatCurrency = transaction.fiat_currency || 'NGN';

    console.log('📊 Current Transaction Details:');
    console.log(`   Fiat Amount: ${fiatAmount} ${fiatCurrency}`);
    console.log(`   Crypto Amount: ${cryptoAmount} SOL`);
    console.log(`   User ID: ${userId}\n`);

    // Get current SOL rate in NGN
    const { data: rateData, error: rateError } = await supabase
      .from('crypto_rates')
      .select('price_ngn, price_usd')
      .eq('crypto_symbol', 'SOL')
      .eq('is_active', true)
      .order('created_at', { ascending: false })
      .limit(1)
      .single();

    let solRateNGN = 0; // From crypto_rates or pricing engine
    if (!rateError && rateData) {
      const priceUsd = parseFloat(rateData.price_usd || 0);
      const priceNgnRaw = parseFloat(rateData.price_ngn || 0);
      
      // Check if price_ngn is exchange rate or actual price
      if (priceNgnRaw >= 1000 && priceNgnRaw <= 2000 && priceUsd > 0) {
        solRateNGN = priceNgnRaw * priceUsd;
      } else {
        solRateNGN = priceNgnRaw;
      }
    }

    console.log(`💱 Current SOL Rate: ₦${solRateNGN.toFixed(2)} per SOL\n`);

    // Calculate correct SOL amount
    // User paid ₦2984.05 (or similar)
    // Fee is 1%, so after fee: ₦2984.05 * 0.99 = ₦2954.21
    // Correct SOL = (NGN after fee) / (SOL rate from pricing engine)
    
    const ngnPaid = fiatCurrency === 'USD' ? fiatAmount * 1650 : fiatAmount; // Convert USD to NGN if needed
    const fee = ngnPaid * 0.01; // 1% fee
    const ngnAfterFee = ngnPaid - fee;
    const correctSolAmount = ngnAfterFee / solRateNGN;

    console.log('📐 Calculations:');
    console.log(`   NGN Paid: ₦${ngnPaid.toFixed(2)}`);
    console.log(`   Fee (1%): ₦${fee.toFixed(2)}`);
    console.log(`   NGN After Fee: ₦${ngnAfterFee.toFixed(2)}`);
    console.log(`   Correct SOL Amount: ${correctSolAmount.toFixed(8)} SOL\n`);

    const solDifference = cryptoAmount - correctSolAmount;
    console.log(`📉 SOL Over-credited: ${solDifference.toFixed(8)} SOL\n`);

    if (solDifference <= 0) {
      console.log('✅ No correction needed - balance is correct or under-credited');
      return;
    }

    // Get current user SOL balance
    const { data: userWallet, error: walletError } = await supabase
      .from('user_wallets')
      .select('sol_balance')
      .eq('user_id', userId)
      .single();

    if (walletError && walletError.code !== 'PGRST116') {
      console.error('❌ Error fetching user wallet:', walletError);
      return;
    }

    const currentSolBalance = userWallet ? parseFloat(userWallet.sol_balance || 0) : 0;
    const newSolBalance = currentSolBalance - solDifference;

    console.log('💰 Balance Adjustment:');
    console.log(`   Current SOL Balance: ${currentSolBalance.toFixed(8)} SOL`);
    console.log(`   Amount to Debit: ${solDifference.toFixed(8)} SOL`);
    console.log(`   New SOL Balance: ${newSolBalance.toFixed(8)} SOL\n`);

    // Confirm before proceeding
    const readline = require('readline');
    const rl = readline.createInterface({
      input: process.stdin,
      output: process.stdout
    });

    return new Promise((resolve) => {
      rl.question('⚠️  Proceed with balance correction? (yes/no): ', async (answer) => {
        rl.close();
        
        if (answer.toLowerCase() !== 'yes') {
          console.log('❌ Correction cancelled');
          resolve();
          return;
        }

        // Perform the correction
        console.log('\n🔄 Applying correction...\n');

        // 1. Update user_wallets
        const { error: updateWalletError } = await supabase
          .from('user_wallets')
          .update({
            sol_balance: Math.max(0, newSolBalance).toFixed(8),
            updated_at: new Date().toISOString()
          })
          .eq('user_id', userId);

        if (updateWalletError) {
          console.error('❌ Error updating user_wallets:', updateWalletError);
          resolve();
          return;
        }
        console.log('✅ Updated user_wallets');

        // 2. Update wallet_balances
        const { error: updateBalanceError } = await supabase
          .from('wallet_balances')
          .upsert({
            user_id: userId,
            currency: 'SOL',
            balance: Math.max(0, newSolBalance).toFixed(8),
            updated_at: new Date().toISOString()
          }, {
            onConflict: 'user_id,currency'
          });

        if (updateBalanceError) {
          console.error('❌ Error updating wallet_balances:', updateBalanceError);
          resolve();
          return;
        }
        console.log('✅ Updated wallet_balances');

        // 3. Update transaction record to correct fiat_currency and amounts
        const { error: updateTxError } = await supabase
          .from('transactions')
          .update({
            fiat_amount: ngnPaid,
            fiat_currency: 'NGN',
            crypto_amount: correctSolAmount.toFixed(8),
            fee_amount: fee,
            fee_currency: 'NGN',
            metadata: {
              ...(transaction.metadata || {}),
              corrected: true,
              original_crypto_amount: cryptoAmount,
              correction_date: new Date().toISOString(),
              correction_reason: 'Fixed incorrect fiat_currency (USD instead of NGN)'
            }
          })
          .eq('id', transactionId);

        if (updateTxError) {
          console.error('❌ Error updating transaction:', updateTxError);
          resolve();
          return;
        }
        console.log('✅ Updated transaction record');

        // 4. Create correction transaction record
        const { error: correctionTxError } = await supabase
          .from('transactions')
          .insert({
            user_id: userId,
            transaction_type: 'ADJUSTMENT',
            crypto_currency: 'SOL',
            crypto_amount: solDifference,
            fiat_amount: 0,
            fiat_currency: 'NGN',
            status: 'COMPLETED',
            metadata: {
              type: 'balance_correction',
              original_transaction_id: transactionId,
              reason: 'Corrected over-credited SOL from buy transaction',
              correction_date: new Date().toISOString()
            }
          });

        if (correctionTxError) {
          console.error('⚠️  Warning: Could not create correction transaction:', correctionTxError);
        } else {
          console.log('✅ Created correction transaction record');
        }

        // Verify the correction
        const { data: verifyWallet } = await supabase
          .from('user_wallets')
          .select('sol_balance')
          .eq('user_id', userId)
          .single();

        console.log('\n✅ Correction completed!');
        console.log(`   Final SOL Balance: ${parseFloat(verifyWallet?.sol_balance || 0).toFixed(8)} SOL\n`);

        resolve();
      });
    });

  } catch (error) {
    console.error('❌ Error:', error);
  }
}

// Run the script
if (require.main === module) {
  fixIncorrectSolBuy().catch(console.error);
}

module.exports = { fixIncorrectSolBuy, fixSpecificTransaction };
