/**
 * One-time script to fix all missing withdrawal transactions
 * This script creates transaction records for all withdrawals that don't have corresponding transactions
 * 
 * Usage:
 *   npx tsx scripts/fix-missing-withdrawal-transactions.ts
 * 
 * Or with user filter:
 *   npx tsx scripts/fix-missing-withdrawal-transactions.ts --user-id <user-id>
 */

import { createClient } from '@supabase/supabase-js';
import * as dotenv from 'dotenv';
import { resolve } from 'path';

// Load environment variables from common locations
const envPaths = [
  resolve(process.cwd(), '.env.local'),
  resolve(process.cwd(), '..', '.env.local'),
];

for (const envPath of envPaths) {
  try {
    dotenv.config({ path: envPath });
    break;
  } catch (e) {
    // Continue to next path
  }
}

// Try to get Supabase URL from multiple sources
const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL 
  || process.env.EXPO_PUBLIC_SUPABASE_URL 
  || 'https://slleojsdpctxhlsoyenr.supabase.co';

const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY || '';
const SUPABASE_ANON_KEY = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY || '';

// Use service role key if available, otherwise use anon key (will need admin permissions)
const SUPABASE_KEY = SUPABASE_SERVICE_ROLE_KEY || SUPABASE_ANON_KEY;

if (!SUPABASE_KEY) {
  console.error('❌ Missing required environment variables:');
  console.error('   SUPABASE_SERVICE_ROLE_KEY (preferred) or NEXT_PUBLIC_SUPABASE_ANON_KEY');
  console.error('\nPlease set SUPABASE_SERVICE_ROLE_KEY in .env.local:');
  console.error('   SUPABASE_SERVICE_ROLE_KEY=your_service_role_key_here');
  console.error('\nYou can find your service role key in Supabase Dashboard → Settings → API');
  process.exit(1);
}

if (!SUPABASE_SERVICE_ROLE_KEY) {
  console.warn('⚠️  Using anon key instead of service role key. This may fail if RLS policies block access.');
  console.warn('   For best results, use SUPABASE_SERVICE_ROLE_KEY\n');
}

console.log(`✅ Using Supabase URL: ${SUPABASE_URL}`);
console.log(`✅ Using ${SUPABASE_SERVICE_ROLE_KEY ? 'service role' : 'anon'} key: ${SUPABASE_KEY.substring(0, 20)}...`);
console.log('');

// Create Supabase client
// If using service role key, it bypasses RLS. If using anon key, RLS policies apply.
const supabase = createClient(SUPABASE_URL, SUPABASE_KEY, {
  auth: {
    autoRefreshToken: false,
    persistSession: false,
  },
});

const WITHDRAWAL_FEE_PERCENTAGE = 0.03;

function calculateWithdrawalFee(amount: number): number {
  return Math.round(amount * WITHDRAWAL_FEE_PERCENTAGE * 100) / 100;
}

/**
 * Create transaction record for a withdrawal
 */
async function createTransactionForWithdrawal(withdrawal: any): Promise<{ success: boolean; transactionId?: string; error?: string }> {
  try {
    // Check if transaction already exists
    const { data: existingTransaction } = await supabase
      .from('transactions')
      .select('id')
      .eq('user_id', withdrawal.user_id)
      .eq('metadata->>withdrawal_id', withdrawal.id)
      .maybeSingle();

    if (existingTransaction) {
      return { success: true, transactionId: existingTransaction.id };
    }

    // Calculate fee if not present
    const feeAmount = withdrawal.fee_amount || calculateWithdrawalFee(parseFloat(withdrawal.amount.toString()));
    
    // Map withdrawal status to transaction status
    const transactionStatus = withdrawal.status === 'completed' ? 'COMPLETED'
      : withdrawal.status === 'failed' ? 'FAILED'
      : withdrawal.status === 'cancelled' ? 'CANCELLED'
      : withdrawal.status === 'processing' ? 'CONFIRMING'
      : 'PENDING';

    // Create transaction record
    const { data: transactionData, error: transactionError } = await supabase
      .from('transactions')
      .insert({
        user_id: withdrawal.user_id,
        transaction_type: 'WITHDRAWAL',
        crypto_currency: 'FIAT',
        fiat_amount: parseFloat(withdrawal.amount.toString()),
        fiat_currency: withdrawal.currency || 'NGN',
        fee_amount: feeAmount,
        fee_percentage: WITHDRAWAL_FEE_PERCENTAGE * 100,
        fee_currency: withdrawal.currency || 'NGN',
        status: transactionStatus,
        external_transaction_id: withdrawal.transfer_id || null,
        external_reference: withdrawal.transfer_reference || null,
        notes: `Withdrawal to ${withdrawal.bank_name} - ${withdrawal.account_name}`,
        completed_at: withdrawal.status === 'completed' ? withdrawal.updated_at : null,
        metadata: {
          withdrawal_id: withdrawal.id,
          bank_name: withdrawal.bank_name,
          account_number: withdrawal.account_number,
          account_name: withdrawal.account_name,
          bank_code: withdrawal.bank_code,
          withdrawal_type: 'bank_transfer',
          created_retroactively: true,
          fixed_at: new Date().toISOString(),
        },
      })
      .select('id')
      .single();

    if (transactionError) {
      return {
        success: false,
        error: transactionError.message || 'Failed to create transaction record',
      };
    }

    return { success: true, transactionId: transactionData.id };
  } catch (error: any) {
    return {
      success: false,
      error: error.message || 'Failed to create transaction record',
    };
  }
}

/**
 * Main function to fix all missing withdrawal transactions
 */
async function fixAllMissingWithdrawalTransactions(userId?: string) {
  console.log('🔍 Starting to fix missing withdrawal transactions...\n');

  try {
    // Get all withdrawals (optionally filtered by user)
    let query = supabase
      .from('withdrawals')
      .select('id, user_id, amount, fee_amount, currency, status, bank_name, account_name, account_number, bank_code, transfer_id, transfer_reference, created_at, updated_at')
      .order('created_at', { ascending: false });

    if (userId) {
      query = query.eq('user_id', userId);
      console.log(`📋 Filtering by user_id: ${userId}\n`);
    }

    const { data: withdrawals, error: withdrawalsError } = await query;

    if (withdrawalsError) {
      console.error('❌ Error fetching withdrawals:', withdrawalsError);
      process.exit(1);
    }

    if (!withdrawals || withdrawals.length === 0) {
      console.log('✅ No withdrawals found');
      return;
    }

    console.log(`📊 Found ${withdrawals.length} withdrawal(s) to check\n`);

    let fixed = 0;
    let alreadyExists = 0;
    let errors = 0;
    const errorDetails: Array<{ withdrawalId: string; error: string }> = [];

    // Process each withdrawal
    for (let i = 0; i < withdrawals.length; i++) {
      const withdrawal = withdrawals[i];
      const progress = `[${i + 1}/${withdrawals.length}]`;
      
      console.log(`${progress} Checking withdrawal ${withdrawal.id}...`);

      // Check if transaction already exists
      const { data: existingTransaction } = await supabase
        .from('transactions')
        .select('id')
        .eq('user_id', withdrawal.user_id)
        .eq('metadata->>withdrawal_id', withdrawal.id)
        .maybeSingle();

      if (existingTransaction) {
        console.log(`   ✅ Transaction already exists: ${existingTransaction.id}`);
        alreadyExists++;
        continue;
      }

      // Create transaction for this withdrawal
      const result = await createTransactionForWithdrawal(withdrawal);
      
      if (result.success && result.transactionId) {
        console.log(`   ✅ Created transaction: ${result.transactionId}`);
        fixed++;
      } else {
        console.log(`   ❌ Failed: ${result.error || 'Unknown error'}`);
        errors++;
        errorDetails.push({
          withdrawalId: withdrawal.id,
          error: result.error || 'Unknown error',
        });
      }

      // Small delay to avoid overwhelming the database
      await new Promise(resolve => setTimeout(resolve, 100));
    }

    // Print summary
    console.log('\n' + '='.repeat(60));
    console.log('📊 SUMMARY');
    console.log('='.repeat(60));
    console.log(`Total withdrawals checked: ${withdrawals.length}`);
    console.log(`✅ Transactions created: ${fixed}`);
    console.log(`ℹ️  Already had transactions: ${alreadyExists}`);
    console.log(`❌ Errors: ${errors}`);

    if (errorDetails.length > 0) {
      console.log('\n❌ Error Details:');
      errorDetails.forEach(({ withdrawalId, error }) => {
        console.log(`   - Withdrawal ${withdrawalId}: ${error}`);
      });
    }

    console.log('\n✅ Script completed!');
  } catch (error: any) {
    console.error('\n❌ Fatal error:', error);
    process.exit(1);
  }
}

// Parse command line arguments
const args = process.argv.slice(2);
const userIdArg = args.find(arg => arg.startsWith('--user-id='));
const userId = userIdArg ? userIdArg.split('=')[1] : undefined;

// Run the script
fixAllMissingWithdrawalTransactions(userId)
  .then(() => {
    process.exit(0);
  })
  .catch((error) => {
    console.error('❌ Script failed:', error);
    process.exit(1);
  });

