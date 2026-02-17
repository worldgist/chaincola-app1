/**
 * Verify all transactions for chaincolawallet@gmail.com
 * Check if previous transactions were also incorrectly credited
 */

const { createClient } = require('@supabase/supabase-js');
require('dotenv').config({ path: '.env.local' });

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || 'https://slleojsdpctxhlsoyenr.supabase.co';
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!supabaseServiceKey) {
  console.error('❌ Error: SUPABASE_SERVICE_ROLE_KEY not found');
  process.exit(1);
}

const supabase = createClient(supabaseUrl, supabaseServiceKey);

const USER_ID = 'f04afc9d-8cde-40dd-b78d-094369aab856';

async function verifyTransactions() {
  console.log('\n🔍 Verifying all SOL sell transactions...\n');
  console.log('='.repeat(80));

  try {
    const { data: transactions, error } = await supabase
      .from('transactions')
      .select('*')
      .eq('user_id', USER_ID)
      .eq('crypto_currency', 'SOL')
      .eq('transaction_type', 'SELL')
      .eq('status', 'COMPLETED')
      .eq('fiat_currency', 'NGN')
      .order('created_at', { ascending: true });

    if (error) {
      console.error('❌ Error:', error);
      return;
    }

    console.log(`Found ${transactions.length} transaction(s):\n`);

    let runningBalance = 0;
    let totalCredited = 0;

    transactions.forEach((tx, idx) => {
      const cryptoAmount = parseFloat(tx.crypto_amount || '0');
      const fiatAmount = parseFloat(tx.fiat_amount || '0');
      const rate = parseFloat(tx.metadata?.rate || '0');
      const feePercentage = parseFloat(tx.metadata?.fee_percentage || '0.01');

      // Calculate expected amount
      let expectedAmount = 0;
      if (rate > 0) {
        const beforeFee = cryptoAmount * rate;
        const fee = beforeFee * feePercentage;
        expectedAmount = beforeFee - fee;
      }

      runningBalance += fiatAmount;
      totalCredited += fiatAmount;

      const difference = fiatAmount - expectedAmount;
      const isCorrect = rate > 0 ? Math.abs(difference) < 1 : true;

      console.log(`${idx + 1}. ${new Date(tx.created_at).toLocaleString()}`);
      console.log(`   Transaction: ${tx.id.substring(0, 8)}...`);
      console.log(`   SOL: ${cryptoAmount}`);
      if (rate > 0) {
        console.log(`   Rate: ₦${rate.toLocaleString()}`);
        console.log(`   Expected: ₦${expectedAmount.toFixed(2)}`);
        console.log(`   Credited: ₦${fiatAmount.toLocaleString()}`);
        console.log(`   Difference: ₦${difference.toFixed(2)} ${isCorrect ? '✅' : '⚠️'}`);
      } else {
        console.log(`   Credited: ₦${fiatAmount.toLocaleString()} ⚠️  (No rate info)`);
      }
      console.log(`   Running Balance: ₦${runningBalance.toFixed(2)}\n`);
    });

    console.log('='.repeat(80));
    console.log(`Total Credited: ₦${totalCredited.toFixed(2)}`);
    
    // Get current balance
    const { data: wallet } = await supabase
      .from('user_wallets')
      .select('ngn_balance')
      .eq('user_id', USER_ID)
      .single();

    const currentBalance = parseFloat(wallet?.ngn_balance || '0');
    console.log(`Current Balance: ₦${currentBalance.toLocaleString()}`);
    console.log(`Expected Balance (sum of all credits): ₦${totalCredited.toFixed(2)}`);
    
    const discrepancy = currentBalance - totalCredited;
    console.log(`Discrepancy: ₦${discrepancy.toFixed(2)} ${Math.abs(discrepancy) < 1 ? '✅' : '⚠️'}\n`);

    // Check if user expects balance to be only ₦2,568.44
    const lastTx = transactions[transactions.length - 1];
    const lastTxAmount = parseFloat(lastTx.fiat_amount || '0');
    
    if (Math.abs(lastTxAmount - 2568.44) < 1) {
      console.log('⚠️  NOTE: User reported balance should be ₦2,568.44');
      console.log('   This suggests only the last transaction should be credited.');
      console.log('   However, there are multiple previous transactions.');
      console.log('   Please verify if previous transactions were legitimate.\n');
    }

  } catch (error) {
    console.error('❌ Error:', error);
  }
}

verifyTransactions().catch(console.error);
