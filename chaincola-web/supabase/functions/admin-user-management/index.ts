// Admin User Management Edge Function
// Handles admin operations: get users, suspend, activate, delete, credit, debit

import { serve } from 'https://deno.land/std@0.168.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

interface RequestBody {
  action: 'getUsers' | 'getUserDetails' | 'suspendUser' | 'activateUser' | 'deleteUser' | 'creditBalance' | 'debitBalance';
  userId?: string;
  page?: number;
  limit?: number;
  search?: string;
  status?: string;
  amount?: number;
  currency?: string;
  reason?: string;
  permanent?: boolean;
}

serve(async (req) => {
  // Handle CORS preflight
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  try {
    // Get authorization header
    const authHeader = req.headers.get('Authorization');
    if (!authHeader) {
      return new Response(
        JSON.stringify({ error: 'Missing authorization header' }),
        { status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Create Supabase client
    const supabaseUrl = Deno.env.get('SUPABASE_URL') || '';
    const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') || '';
    const supabase = createClient(supabaseUrl, supabaseServiceKey);

    // Verify admin user
    const token = authHeader.replace('Bearer ', '');
    const { data: { user }, error: authError } = await supabase.auth.getUser(token);

    if (authError || !user) {
      return new Response(
        JSON.stringify({ error: 'Invalid or expired token' }),
        { status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Check if user is admin
    const { data: profile, error: profileError } = await supabase
      .from('user_profiles')
      .select('is_admin, role')
      .eq('user_id', user.id)
      .single();

    if (profileError || !profile || (!profile.is_admin && profile.role !== 'admin')) {
      return new Response(
        JSON.stringify({ error: 'Admin access required' }),
        { status: 403, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Parse request body
    const body: RequestBody = await req.json();
    const { action, userId, page = 1, limit = 20, search, status, amount, currency, reason, permanent = false } = body;

    // Handle different actions
    switch (action) {
      case 'getUsers': {
        // Query user_profiles first
        let query = supabase
          .from('user_profiles')
          .select('*', { count: 'exact' });

        // Apply filters
        if (search) {
          query = query.or(`full_name.ilike.%${search}%,email.ilike.%${search}%,phone_number.ilike.%${search}%`);
        }
        if (status && status !== 'all') {
          query = query.eq('account_status', status);
        }

        // Apply pagination
        const from = (page - 1) * limit;
        const to = from + limit - 1;
        query = query.range(from, to);

        // Order by created_at desc
        query = query.order('created_at', { ascending: false });

        const { data: userProfiles, error: usersError, count } = await query;

        if (usersError) {
          throw usersError;
        }

        // Get auth user data separately for each user
        const usersWithAuthData = await Promise.all(
          (userProfiles || []).map(async (profile) => {
            // Get auth user data using admin API
            const { data: authUser } = await supabase.auth.admin.getUserById(profile.user_id);
            
            return {
              ...profile,
              email: profile.email || authUser?.user?.email || '',
              email_confirmed_at: authUser?.user?.email_confirmed_at || null,
              user_created_at: authUser?.user?.created_at || profile.created_at,
            };
          })
        );

        // Get wallet balances for each user
        // For NGN/USD: Check wallets table first (same logic as getNgnBalance/getUsdBalance)
        // For crypto: Use wallet_balances table
        const usersWithBalances = await Promise.all(
          usersWithAuthData.map(async (user) => {
            // Get crypto balances from wallet_balances table
            const { data: balances } = await supabase
              .from('wallet_balances')
              .select('currency, balance')
              .eq('user_id', user.user_id)
              .in('currency', ['BTC', 'ETH', 'USDT', 'USDC', 'XRP', 'SOL', 'btc', 'eth', 'usdt', 'usdc', 'xrp', 'sol']);

            const balancesMap: Record<string, number> = {};
            (balances || []).forEach((b) => {
              balancesMap[b.currency.toLowerCase()] = parseFloat(b.balance);
            });

            // Get NGN and USD balances from wallets table (primary source)
            // This matches the logic in getNgnBalance/getUsdBalance
            const { data: wallet } = await supabase
              .from('wallets')
              .select('ngn_balance, usd_balance')
              .eq('user_id', user.user_id)
              .single();

            // Use wallets table balance if available, otherwise fallback to wallet_balances
            let ngnBalance = 0;
            let usdBalance = 0;
            
            if (wallet && !wallet.error) {
              ngnBalance = parseFloat(wallet.ngn_balance?.toString() || '0') || 0;
              usdBalance = parseFloat(wallet.usd_balance?.toString() || '0') || 0;
            } else {
              // Fallback to wallet_balances if wallets table doesn't have entry
              ngnBalance = balancesMap['ngn'] || 0;
              usdBalance = balancesMap['usd'] || 0;
            }

            return {
              ...user,
              total_btc_balance: balancesMap['btc'] || 0,
              total_eth_balance: balancesMap['eth'] || 0,
              total_usdt_balance: balancesMap['usdt'] || 0,
              total_usdc_balance: balancesMap['usdc'] || 0,
              total_sol_balance: balancesMap['sol'] || 0,
              total_ngn_balance: ngnBalance, // Real balance from wallets table
              total_usd_balance: usdBalance, // Real balance from wallets table
            };
          })
        );

        return new Response(
          JSON.stringify({
            success: true,
            data: {
              users: usersWithBalances,
              pagination: {
                page,
                limit,
                total: count || 0,
                pages: Math.ceil((count || 0) / limit),
              },
            },
          }),
          { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
      }

      case 'getUserDetails': {
        if (!userId) {
          return new Response(
            JSON.stringify({ error: 'userId is required' }),
            { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
          );
        }

        const { data: userProfile, error: userError } = await supabase
          .from('user_profiles')
          .select('*')
          .eq('user_id', userId)
          .single();

        if (userError) {
          throw userError;
        }

        // Get auth user data separately
        const { data: authUser } = await supabase.auth.admin.getUserById(userId);

        // Get crypto balances from wallet_balances table
        const { data: balances } = await supabase
          .from('wallet_balances')
          .select('currency, balance, locked_balance')
          .eq('user_id', userId);

        const balancesMap: Record<string, { balance: number; locked: number }> = {};
        (balances || []).forEach((b) => {
          balancesMap[b.currency.toLowerCase()] = {
            balance: parseFloat(b.balance),
            locked: parseFloat(b.locked_balance),
          };
        });

        // Get NGN and USD balances from wallets table (primary source)
        // This matches the logic in getNgnBalance/getUsdBalance
        const { data: wallet } = await supabase
          .from('wallets')
          .select('ngn_balance, usd_balance')
          .eq('user_id', userId)
          .single();

        // Use wallets table balance if available, otherwise fallback to wallet_balances
        let ngnBalance = balancesMap['ngn']?.balance || 0;
        let usdBalance = balancesMap['usd']?.balance || 0;
        
        if (wallet && !wallet.error) {
          ngnBalance = parseFloat(wallet.ngn_balance?.toString() || '0') || 0;
          usdBalance = parseFloat(wallet.usd_balance?.toString() || '0') || 0;
        }

        return new Response(
          JSON.stringify({
            success: true,
            data: {
              ...userProfile,
              email: userProfile.email || authUser?.user?.email || '',
              email_confirmed_at: authUser?.user?.email_confirmed_at || null,
              user_created_at: authUser?.user?.created_at || userProfile.created_at,
              total_btc_balance: balancesMap['btc']?.balance || 0,
              total_eth_balance: balancesMap['eth']?.balance || 0,
              total_usdt_balance: balancesMap['usdt']?.balance || 0,
              total_usdc_balance: balancesMap['usdc']?.balance || 0,
              total_ngn_balance: ngnBalance, // Real balance from wallets table
              total_usd_balance: usdBalance, // Real balance from wallets table
            },
          }),
          { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
      }

      case 'suspendUser': {
        if (!userId) {
          return new Response(
            JSON.stringify({ error: 'userId is required' }),
            { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
          );
        }

        const { error: suspendError } = await supabase.rpc('admin_suspend_user', {
          p_user_id: userId,
          p_admin_user_id: user.id,
        });

        if (suspendError) {
          throw suspendError;
        }

        return new Response(
          JSON.stringify({ success: true }),
          { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
      }

      case 'activateUser': {
        if (!userId) {
          return new Response(
            JSON.stringify({ error: 'userId is required' }),
            { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
          );
        }

        const { error: activateError } = await supabase.rpc('admin_activate_user', {
          p_user_id: userId,
          p_admin_user_id: user.id,
        });

        if (activateError) {
          throw activateError;
        }

        return new Response(
          JSON.stringify({ success: true }),
          { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
      }

      case 'deleteUser': {
        if (!userId) {
          return new Response(
            JSON.stringify({ error: 'userId is required' }),
            { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
          );
        }

        if (permanent) {
          // Permanently delete user (requires service role)
          const { error: deleteError } = await supabase.auth.admin.deleteUser(userId);
          if (deleteError) {
            throw deleteError;
          }
        } else {
          // Soft delete - just mark as deleted
          const { error: updateError } = await supabase
            .from('user_profiles')
            .update({ account_status: 'deleted', updated_at: new Date().toISOString() })
            .eq('user_id', userId);

          if (updateError) {
            throw updateError;
          }

          // Log the action
          await supabase.from('admin_action_logs').insert({
            admin_user_id: user.id,
            target_user_id: userId,
            action_type: 'delete',
            action_details: { permanent: false },
          });
        }

        return new Response(
          JSON.stringify({ success: true }),
          { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
      }

      case 'creditBalance': {
        if (!userId || !amount || !currency) {
          return new Response(
            JSON.stringify({ error: 'userId, amount, and currency are required' }),
            { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
          );
        }

        const { error: creditError } = await supabase.rpc('admin_credit_balance', {
          p_user_id: userId,
          p_currency: currency.toUpperCase(),
          p_amount: amount,
          p_reason: reason || 'Admin credit',
          p_admin_user_id: user.id,
        });

        if (creditError) {
          throw creditError;
        }

        return new Response(
          JSON.stringify({ success: true }),
          { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
      }

      case 'debitBalance': {
        if (!userId || !amount || !currency) {
          return new Response(
            JSON.stringify({ error: 'userId, amount, and currency are required' }),
            { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
          );
        }

        const { error: debitError } = await supabase.rpc('admin_debit_balance', {
          p_user_id: userId,
          p_currency: currency.toUpperCase(),
          p_amount: amount,
          p_reason: reason || 'Admin debit',
          p_admin_user_id: user.id,
        });

        if (debitError) {
          throw debitError;
        }

        return new Response(
          JSON.stringify({ success: true }),
          { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
      }

      default:
        return new Response(
          JSON.stringify({ error: 'Invalid action' }),
          { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
    }
  } catch (error: any) {
    console.error('Admin user management error:', error);
    return new Response(
      JSON.stringify({ error: error.message || 'Internal server error' }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});
