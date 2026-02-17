/**
 * Shared utility function to credit NGN balance
 * 
 * IMPORTANT: This function uses DATABASE balances exclusively (user_wallets, wallet_balances, and wallets tables).
 * It does NOT check on-chain balances - all operations use the database.
 * 
 * CRITICAL FIX: This function now uses user_wallets.ngn_balance as PRIMARY source of truth
 * to prevent using incorrect balances from out-of-sync tables.
 * 
 * Previously, it used Math.max() to pick the maximum balance from multiple tables,
 * which could select incorrect balances (e.g., ₦399,670.30 instead of ₦2,568.44).
 * 
 * @param supabase - Supabase client instance
 * @param userId - User ID to credit
 * @param amountToCredit - Amount of NGN to credit
 * @returns Promise with success status and new balance
 */

import { SupabaseClient } from "https://esm.sh/@supabase/supabase-js@2";

export async function creditNgnBalance(
  supabase: SupabaseClient,
  userId: string,
  amountToCredit: number
): Promise<{ success: boolean; newBalance: number; error?: string }> {
  try {
    console.log(`💰 Crediting NGN: User=${userId}, Amount=₦${amountToCredit.toFixed(2)}`);

    // CRITICAL FIX: Use user_wallets.ngn_balance as PRIMARY source of truth
    // NEVER use Math.max() or check other tables for NGN balance to prevent using incorrect balances
    // Only check other tables if user_wallets balance is NULL or 0 (new user)
    const [userWalletResult, ngnBalanceResult, walletResult] = await Promise.all([
      supabase
        .from('user_wallets')
        .select('ngn_balance')
        .eq('user_id', userId)
        .single(),
      supabase
        .from('wallet_balances')
        .select('balance')
        .eq('user_id', userId)
        .eq('currency', 'NGN')
        .single(),
      supabase
        .from('wallets')
        .select('ngn_balance')
        .eq('user_id', userId)
        .single(),
    ]);

    // Get balance from user_wallets (PRIMARY source of truth)
    const balanceFromUserWallets = 
      (userWalletResult.error && userWalletResult.error.code === 'PGRST116')
        ? 0
        : (userWalletResult.data ? parseFloat(userWalletResult.data.ngn_balance || '0') : 0);

    // Get balance from wallet_balances (for logging/reference only)
    const balanceFromWalletBalances = 
      (ngnBalanceResult.error && ngnBalanceResult.error.code === 'PGRST116')
        ? 0
        : (ngnBalanceResult.data ? parseFloat(ngnBalanceResult.data.balance || '0') : 0);

    // Get balance from wallets table (for logging/reference only)
    const balanceFromWallets =
      (walletResult.error && walletResult.error.code === 'PGRST116')
        ? 0
        : (walletResult.data ? parseFloat(walletResult.data.ngn_balance || '0') : 0);

    // ALWAYS use user_wallets.ngn_balance as PRIMARY source of truth
    // If it's NULL or 0, treat it as 0 (new user or no balance)
    // DO NOT use Math.max() which can pick incorrect balances from out-of-sync tables
    const currentNgnBalance = balanceFromUserWallets || 0;
    const newNgnBalance = currentNgnBalance + amountToCredit;

    console.log(`   Current balances:`);
    console.log(`     user_wallets.ngn_balance (PRIMARY): ₦${balanceFromUserWallets.toFixed(2)}`);
    console.log(`     wallet_balances: ₦${balanceFromWalletBalances.toFixed(2)}`);
    console.log(`     wallets.ngn_balance: ₦${balanceFromWallets.toFixed(2)}`);
    console.log(`   Using PRIMARY source: ₦${currentNgnBalance.toFixed(2)}`);
    console.log(`   Adding: ₦${amountToCredit.toFixed(2)}`);
    console.log(`   New balance: ₦${newNgnBalance.toFixed(2)}`);

    // Update user_wallets table (PRIMARY source of truth)
    const { error: updateUserWalletError } = await supabase
      .from('user_wallets')
      .upsert({
        user_id: userId,
        ngn_balance: newNgnBalance.toFixed(2),
        updated_at: new Date().toISOString(),
      }, {
        onConflict: 'user_id',
      });

    if (updateUserWalletError) {
      throw new Error(`Failed to credit NGN in user_wallets: ${updateUserWalletError.message}`);
    }
    console.log(`✅ Updated user_wallets.ngn_balance to: ₦${newNgnBalance.toFixed(2)}`);

    // Update wallet_balances table (for app compatibility)
    const { error: updateError } = await supabase
      .from('wallet_balances')
      .upsert({
        user_id: userId,
        currency: 'NGN',
        balance: newNgnBalance.toFixed(2),
        updated_at: new Date().toISOString(),
      }, {
        onConflict: 'user_id,currency',
      });

    if (updateError) {
      console.error('⚠️ Failed to update wallet_balances (non-critical):', updateError);
      // Don't fail the whole operation if wallet_balances update fails
    } else {
      console.log(`✅ Updated wallet_balances.balance to: ₦${newNgnBalance.toFixed(2)}`);
    }

    // Also update wallets table (for backward compatibility)
    const { data: wallet, error: walletError } = await supabase
      .from('wallets')
      .select('ngn_balance')
      .eq('user_id', userId)
      .single();

    if (walletError && walletError.code === 'PGRST116') {
      // Wallet doesn't exist, create it
      const { error: createError } = await supabase
        .from('wallets')
        .insert({
          user_id: userId,
          usd_balance: 0,
          ngn_balance: newNgnBalance.toFixed(2),
          created_at: new Date().toISOString(),
          updated_at: new Date().toISOString(),
        });

      if (createError) {
        console.error('⚠️ Failed to create wallet record (non-critical):', createError);
        // Don't fail the whole operation if wallet creation fails
      } else {
        console.log(`✅ Created wallet record with NGN balance: ₦${newNgnBalance.toFixed(2)}`);
      }
    } else if (!walletError && wallet) {
      // Wallet exists, update it
      const { error: updateWalletError } = await supabase
        .from('wallets')
        .update({
          ngn_balance: newNgnBalance.toFixed(2),
          updated_at: new Date().toISOString(),
        })
        .eq('user_id', userId);

      if (updateWalletError) {
        console.error('⚠️ Failed to update wallets table (non-critical):', updateWalletError);
        // Don't fail the whole operation if wallet update fails
      } else {
        console.log(`✅ Updated wallets.ngn_balance to: ₦${newNgnBalance.toFixed(2)}`);
      }
    } else if (walletError) {
      console.error('⚠️ Error checking wallets table (non-critical):', walletError);
      // Don't fail the whole operation
    }

    console.log(`✅ NGN credited successfully. New balance: ₦${newNgnBalance.toFixed(2)}`);

    return {
      success: true,
      newBalance: newNgnBalance,
    };
  } catch (error: any) {
    console.error('❌ Error crediting NGN balance:', error);
    return {
      success: false,
      newBalance: 0,
      error: error.message || 'Failed to credit NGN balance',
    };
  }
}








