/**
 * Check Solana wallet address balance on-chain and update database
 * Address: 5htD5gdX7dVvC1qZnuZaMMaPryy4HPVcHDkddo6Q2Qrc
 * Transaction: 2yTdEB6vfBtNyf6Mqbj1NBW4evMJ6DAWCWEYanvEgFEBo7ZratXZnSayR7QTXnD6d6oZ1T3jq6G3t4WTirLKnfJD
 */

const { createClient } = require('@supabase/supabase-js');
require('dotenv').config({ path: '.env.local' });

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || 'https://slleojsdpctxhlsoyenr.supabase.co';
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!supabaseServiceKey) {
  console.error('❌ Missing SUPABASE_SERVICE_ROLE_KEY');
  process.exit(1);
}

const supabase = createClient(supabaseUrl, supabaseServiceKey);

// Wallet address from the transaction
const SOL_ADDRESS = '5htD5gdX7dVvC1qZnuZaMMaPryy4HPVcHDkddo6Q2Qrc';
const TX_HASH = '2yTdEB6vfBtNyf6Mqbj1NBW4evMJ6DAWCWEYanvEgFEBo7ZratXZnSayR7QTXnD6d6oZ1T3jq6G3t4WTirLKnfJD';
const TX_AMOUNT = 0.01579829; // Gross amount
const TX_FEE = 0.0003828;
const NET_AMOUNT = TX_AMOUNT - TX_FEE; // ~0.01541549 SOL

async function checkAndUpdateBalance() {
  try {
    console.log('🔍 Checking Solana wallet balance and updating database...\n');
    console.log(`📍 Address: ${SOL_ADDRESS}`);
    console.log(`📝 Transaction: ${TX_HASH}\n`);

    // Step 1: Find the user who owns this wallet address
    console.log('Step 1: Finding wallet owner...');
    const { data: wallet, error: walletError } = await supabase
      .from('crypto_wallets')
      .select('user_id, address, asset, network')
      .eq('address', SOL_ADDRESS)
      .eq('asset', 'SOL')
      .eq('network', 'mainnet')
      .maybeSingle();

    if (walletError) {
      console.error('❌ Error fetching wallet:', walletError);
      return;
    }

    if (!wallet) {
      console.log('⚠️ Wallet not found in crypto_wallets table');
      console.log('Trying alternative search...');
      
      // Try without network filter
      const { data: wallet2, error: walletError2 } = await supabase
        .from('crypto_wallets')
        .select('user_id, address, asset, network')
        .eq('address', SOL_ADDRESS)
        .maybeSingle();

      if (walletError2 || !wallet2) {
        console.error('❌ Wallet address not found in database');
        console.log('\n💡 The wallet address needs to be linked to a user account.');
        console.log('   Please ensure the wallet is registered in the crypto_wallets table.');
        return;
      }

      console.log(`✅ Found wallet: User ID = ${wallet2.user_id}, Asset = ${wallet2.asset}, Network = ${wallet2.network}`);
      wallet.user_id = wallet2.user_id;
    } else {
      console.log(`✅ Found wallet: User ID = ${wallet.user_id}`);
    }

    const userId = wallet.user_id;

    // Step 2: Check on-chain balance
    console.log('\nStep 2: Checking on-chain balance...');
    const solanaRpcUrl = process.env.SOLANA_RPC_URL || 
                         process.env.ALCHEMY_SOLANA_URL ||
                         'https://solana-mainnet.g.alchemy.com/v2/3L_iw-7-b25_bzLHmLyUJ';

    console.log(`🔗 RPC URL: ${solanaRpcUrl}`);

    const balanceResponse = await fetch(solanaRpcUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        jsonrpc: '2.0',
        id: 1,
        method: 'getBalance',
        params: [SOL_ADDRESS],
      }),
    });

    if (!balanceResponse.ok) {
      const errorText = await balanceResponse.text();
      console.error(`❌ Failed to check balance: ${errorText}`);
      return;
    }

    const balanceData = await balanceResponse.json();
    const balanceLamports = balanceData.result?.value || 0;
    const onChainBalanceSOL = balanceLamports / 1e9;

    console.log(`💰 On-chain Balance: ${onChainBalanceSOL.toFixed(9)} SOL (${balanceLamports} lamports)`);

    // Step 3: Get current database balance
    console.log('\nStep 3: Checking database balance...');
    const { data: dbBalance, error: dbError } = await supabase
      .from('wallet_balances')
      .select('balance, locked')
      .eq('user_id', userId)
      .eq('currency', 'SOL')
      .maybeSingle();

    const dbBalanceSOL = dbBalance ? parseFloat(dbBalance.balance || '0') : 0;
    const dbLockedSOL = dbBalance ? parseFloat(dbBalance.locked || '0') : 0;
    const dbAvailableSOL = dbBalanceSOL - dbLockedSOL;

    console.log(`💾 Database Balance: ${dbBalanceSOL.toFixed(9)} SOL`);
    console.log(`🔒 Locked: ${dbLockedSOL.toFixed(9)} SOL`);
    console.log(`✅ Available: ${dbAvailableSOL.toFixed(9)} SOL`);

    // Step 4: Compare and update if needed
    const difference = onChainBalanceSOL - dbBalanceSOL;
    console.log(`\n📊 Difference: ${difference > 0 ? '+' : ''}${difference.toFixed(9)} SOL`);

    if (Math.abs(difference) < 0.000001) {
      console.log('\n✅ Balances match - no update needed');
      return;
    }

    console.log(`\n⚠️ Balance mismatch detected!`);
    console.log(`   On-chain: ${onChainBalanceSOL.toFixed(9)} SOL`);
    console.log(`   Database: ${dbBalanceSOL.toFixed(9)} SOL`);
    console.log(`   Difference: ${difference.toFixed(9)} SOL`);

    // Step 5: Update database balance to match on-chain
    console.log('\nStep 4: Updating database balance...');
    const { error: updateError } = await supabase
      .from('wallet_balances')
      .upsert({
        user_id: userId,
        currency: 'SOL',
        balance: onChainBalanceSOL.toFixed(9),
        updated_at: new Date().toISOString(),
      }, {
        onConflict: 'user_id,currency',
      });

    if (updateError) {
      console.error('❌ Failed to update balance:', updateError);
      return;
    }

    console.log('✅ Balance updated successfully');

    // Step 6: Check if transaction exists, if not create it
    console.log('\nStep 5: Checking transaction record...');
    const { data: existingTx, error: txError } = await supabase
      .from('transactions')
      .select('id, status, crypto_amount')
      .eq('transaction_hash', TX_HASH)
      .maybeSingle();

    if (txError && txError.code !== 'PGRST116') {
      console.error('❌ Error checking transaction:', txError);
    }

    if (!existingTx) {
      console.log('📝 Transaction not found, creating record...');
      
      // Calculate the actual amount received (net after fee)
      const amountReceived = difference > 0 ? difference : NET_AMOUNT;
      
      const { data: newTx, error: insertError } = await supabase
        .from('transactions')
        .insert({
          user_id: userId,
          transaction_type: 'RECEIVE',
          crypto_currency: 'SOL',
          crypto_amount: amountReceived.toFixed(9),
          network: 'mainnet',
          to_address: SOL_ADDRESS,
          transaction_hash: TX_HASH,
          status: 'COMPLETED',
          confirmations: 32,
          completed_at: new Date('2026-01-26T13:58:07+01:00').toISOString(),
          metadata: {
            source: 'manual_sync',
            on_chain_balance: onChainBalanceSOL,
            previous_db_balance: dbBalanceSOL,
            synced_at: new Date().toISOString(),
            fee: TX_FEE,
            gross_amount: TX_AMOUNT,
          },
        })
        .select()
        .single();

      if (insertError) {
        console.error('❌ Failed to create transaction:', insertError);
      } else {
        console.log(`✅ Transaction recorded: ${newTx.id}`);
      }
    } else {
      console.log(`ℹ️ Transaction already exists: ${existingTx.id}, Status: ${existingTx.status}`);
      
      // Update transaction if it's not completed
      if (existingTx.status !== 'COMPLETED' && existingTx.status !== 'CONFIRMED') {
        console.log('🔄 Updating transaction status...');
        const { error: updateTxError } = await supabase
          .from('transactions')
          .update({
            status: 'COMPLETED',
            crypto_amount: NET_AMOUNT.toFixed(9),
            completed_at: new Date('2026-01-26T13:58:07+01:00').toISOString(),
          })
          .eq('id', existingTx.id);

        if (updateTxError) {
          console.error('❌ Failed to update transaction:', updateTxError);
        } else {
          console.log('✅ Transaction updated');
        }
      }
    }

    // Step 7: Verify final balance
    console.log('\nStep 6: Verifying final balance...');
    const { data: finalBalance } = await supabase
      .from('wallet_balances')
      .select('balance')
      .eq('user_id', userId)
      .eq('currency', 'SOL')
      .single();

    const finalBalanceSOL = finalBalance ? parseFloat(finalBalance.balance || '0') : 0;
    console.log(`✅ Final Database Balance: ${finalBalanceSOL.toFixed(9)} SOL`);
    console.log(`✅ On-chain Balance: ${onChainBalanceSOL.toFixed(9)} SOL`);

    if (Math.abs(finalBalanceSOL - onChainBalanceSOL) < 0.000001) {
      console.log('\n✅ Success! Balances are now synchronized.');
    } else {
      console.log(`\n⚠️ Warning: Small discrepancy remains (${Math.abs(finalBalanceSOL - onChainBalanceSOL).toFixed(9)} SOL)`);
    }

    console.log('\n✅ Balance check and update completed!');

  } catch (error) {
    console.error('❌ Error:', error.message);
    console.error(error);
  }
}

// Run the script
checkAndUpdateBalance().catch(console.error);
