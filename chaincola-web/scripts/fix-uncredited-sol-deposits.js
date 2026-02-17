/**
 * Script to fix uncredited SOL deposits
 * Credits SOL deposits that were detected but not credited to user_wallets
 */

require('dotenv').config({ path: '.env.local' });
const { createClient } = require('@supabase/supabase-js');

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL || process.env.SUPABASE_URL || 'https://slleojsdpctxhlsoyenr.supabase.co';
const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY || '';

if (!SUPABASE_SERVICE_ROLE_KEY) {
  console.error('❌ Missing SUPABASE_SERVICE_ROLE_KEY in .env.local');
  process.exit(1);
}

const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

async function fixUncreditedSolDeposits() {
  try {
    console.log('🔍 Finding uncredited SOL deposits...\n');

    // Find SOL transactions that are CONFIRMED but may not be credited
    const { data: transactions, error: txError } = await supabase
      .from('transactions')
      .select('id, user_id, crypto_amount, transaction_hash, status, metadata')
      .eq('crypto_currency', 'SOL')
      .eq('transaction_type', 'RECEIVE')
      .in('status', ['CONFIRMED', 'COMPLETED'])
      .order('created_at', { ascending: false })
      .limit(100);

    if (txError) {
      throw txError;
    }

    if (!transactions || transactions.length === 0) {
      console.log('✅ No SOL deposits found to credit');
      return;
    }

    console.log(`Found ${transactions.length} SOL deposit transactions\n`);

    let credited = 0;
    let alreadyCredited = 0;
    let errors = 0;

    for (const tx of transactions) {
      const metadata = tx.metadata || {};
      const alreadyCreditedFlag = metadata.credited === true;

      // Check current balance in user_wallets
      const { data: userWallet } = await supabase
        .from('user_wallets')
        .select('sol_balance')
        .eq('user_id', tx.user_id)
        .single();

      const { data: walletBalance } = await supabase
        .from('wallet_balances')
        .select('balance')
        .eq('user_id', tx.user_id)
        .eq('currency', 'SOL')
        .single();

      const solAmount = parseFloat(tx.crypto_amount || '0');
      const currentUserWalletBalance = userWallet ? parseFloat(userWallet.sol_balance || '0') : 0;
      const currentWalletBalanceBalance = walletBalance ? parseFloat(walletBalance.balance || '0') : 0;

      console.log(`\n📊 Transaction: ${tx.transaction_hash?.substring(0, 16)}...`);
      console.log(`   Amount: ${solAmount.toFixed(9)} SOL`);
      console.log(`   User Wallet (user_wallets): ${currentUserWalletBalance.toFixed(9)} SOL`);
      console.log(`   Wallet Balance (wallet_balances): ${currentWalletBalanceBalance.toFixed(9)} SOL`);
      console.log(`   Already credited flag: ${alreadyCreditedFlag}`);

      // If wallet_balances has the amount but user_wallets doesn't, we need to credit
      const needsCredit = currentWalletBalanceBalance >= solAmount && currentUserWalletBalance < solAmount;

      if (alreadyCreditedFlag && !needsCredit) {
        console.log(`   ✅ Already credited`);
        alreadyCredited++;
        continue;
      }

      if (needsCredit || !alreadyCreditedFlag) {
        console.log(`   🔄 Crediting to user_wallets...`);

        // Ensure user_wallets exists
        await supabase
          .from('user_wallets')
          .upsert({ user_id: tx.user_id }, { onConflict: 'user_id' });

        // Update user_wallets.sol_balance
        const { error: updateError } = await supabase.rpc('credit_crypto_wallet', {
          p_user_id: tx.user_id,
          p_amount: solAmount,
          p_currency: 'SOL',
        });

        if (updateError) {
          console.error(`   ❌ Error crediting: ${updateError.message}`);
          
          // Fallback: direct update
          const { data: currentWallet } = await supabase
            .from('user_wallets')
            .select('sol_balance')
            .eq('user_id', tx.user_id)
            .single();

          const currentSol = currentWallet ? parseFloat(currentWallet.sol_balance || '0') : 0;
          const newSol = currentSol + solAmount;

          const { error: directUpdateError } = await supabase
            .from('user_wallets')
            .update({ sol_balance: newSol, updated_at: new Date().toISOString() })
            .eq('user_id', tx.user_id);

          if (directUpdateError) {
            console.error(`   ❌ Direct update also failed: ${directUpdateError.message}`);
            errors++;
          } else {
            console.log(`   ✅ Credited via direct update: ${newSol.toFixed(9)} SOL`);
            credited++;

            // Mark as credited in metadata
            await supabase
              .from('transactions')
              .update({
                metadata: {
                  ...metadata,
                  credited: true,
                  credited_at: new Date().toISOString(),
                  credited_via: 'fix_script',
                },
              })
              .eq('id', tx.id);
          }
        } else {
          console.log(`   ✅ Credited successfully`);
          credited++;

          // Mark as credited in metadata
          await supabase
            .from('transactions')
            .update({
              metadata: {
                ...metadata,
                credited: true,
                credited_at: new Date().toISOString(),
                credited_via: 'fix_script',
              },
            })
            .eq('id', tx.id);
        }
      } else {
        console.log(`   ✅ Balance already correct`);
        alreadyCredited++;
      }
    }

    console.log(`\n\n📊 Summary:`);
    console.log(`   ✅ Credited: ${credited}`);
    console.log(`   ✅ Already credited: ${alreadyCredited}`);
    console.log(`   ❌ Errors: ${errors}`);
    console.log(`\n✅ Fix complete!`);

  } catch (error) {
    console.error('❌ Error fixing SOL deposits:', error);
    process.exit(1);
  }
}

fixUncreditedSolDeposits();
