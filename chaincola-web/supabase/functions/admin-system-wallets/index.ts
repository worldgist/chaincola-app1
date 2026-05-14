// Admin: update treasury receive addresses on `public.system_wallets` id=1 (service role; JWT must be admin).

import { serve } from 'https://deno.land/std@0.168.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

const ADDRESS_COLUMNS = new Set([
  'btc_main_address',
  'eth_main_address',
  'sol_main_address',
  'xrp_main_address',
  'usdt_eth_main_address',
  'usdt_tron_main_address',
  'usdt_sol_main_address',
  'usdc_eth_main_address',
  'usdc_sol_main_address',
]);

/** Single-row defaults when id=1 must be inserted (matches public.system_wallets NOT NULL + defaults). */
function systemWalletInsertDefaults(): Record<string, unknown> {
  const z = 0;
  return {
    id: 1,
    btc_inventory: z,
    btc_pending_inventory: z,
    eth_inventory: z,
    eth_pending_inventory: z,
    usdt_inventory: z,
    usdt_pending_inventory: z,
    usdc_inventory: z,
    usdc_pending_inventory: z,
    xrp_inventory: z,
    xrp_pending_inventory: z,
    sol_inventory: z,
    sol_pending_inventory: z,
    ngn_float_balance: z,
    ngn_pending_float: z,
  };
}

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  if (req.method !== 'POST') {
    return new Response(JSON.stringify({ success: false, error: 'Method not allowed' }), {
      status: 405,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }

  try {
    const supabaseUrl = Deno.env.get('SUPABASE_URL') ?? '';
    const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '';
    if (!supabaseUrl || !supabaseServiceKey) {
      return new Response(JSON.stringify({ success: false, error: 'Server misconfigured' }), {
        status: 500,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const supabase = createClient(supabaseUrl, supabaseServiceKey);
    const authHeader = req.headers.get('Authorization');
    if (!authHeader?.startsWith('Bearer ')) {
      return new Response(JSON.stringify({ success: false, error: 'Missing authorization' }), {
        status: 401,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const token = authHeader.replace('Bearer ', '');
    const {
      data: { user },
      error: authError,
    } = await supabase.auth.getUser(token);
    if (authError || !user) {
      return new Response(JSON.stringify({ success: false, error: 'Unauthorized' }), {
        status: 401,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const { data: isAdmin, error: adminErr } = await supabase.rpc('is_user_admin', {
      check_user_id: user.id,
    });
    if (adminErr || !isAdmin) {
      return new Response(JSON.stringify({ success: false, error: 'Admin access required' }), {
        status: 403,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const body = await req.json().catch(() => ({}));
    const action = body?.action as string | undefined;

    if (action === 'update_addresses') {
      const raw = body?.addresses;
      if (raw == null || typeof raw !== 'object' || Array.isArray(raw)) {
        return new Response(JSON.stringify({ success: false, error: 'addresses object required' }), {
          status: 400,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        });
      }

      const patch: Record<string, string | null> = {};
      for (const [k, v] of Object.entries(raw as Record<string, unknown>)) {
        if (!ADDRESS_COLUMNS.has(k)) continue;
        if (v === null || v === undefined) {
          patch[k] = null;
          continue;
        }
        if (typeof v !== 'string') {
          return new Response(JSON.stringify({ success: false, error: `Invalid type for ${k}` }), {
            status: 400,
            headers: { ...corsHeaders, 'Content-Type': 'application/json' },
          });
        }
        const t = v.trim();
        patch[k] = t.length > 0 ? t : null;
      }

      if (Object.keys(patch).length === 0) {
        return new Response(JSON.stringify({ success: false, error: 'No valid address fields to update' }), {
          status: 400,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        });
      }

      const updatedAt = new Date().toISOString();
      let data: Record<string, unknown> | null = null;
      let error: { message: string } | null = null;

      const upd = await supabase
        .from('system_wallets')
        .update({ ...patch, updated_at: updatedAt })
        .eq('id', 1)
        .select('*')
        .maybeSingle();

      data = upd.data as Record<string, unknown> | null;
      error = upd.error;

      if (!error && !data) {
        const ins = await supabase
          .from('system_wallets')
          .insert({
            ...systemWalletInsertDefaults(),
            ...patch,
            updated_at: updatedAt,
          })
          .select('*')
          .maybeSingle();
        data = ins.data as Record<string, unknown> | null;
        error = ins.error;
      }

      if (error) {
        return new Response(JSON.stringify({ success: false, error: error.message }), {
          status: 500,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        });
      }
      if (!data) {
        return new Response(JSON.stringify({ success: false, error: 'system_wallets id=1 could not be created or updated' }), {
          status: 500,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        });
      }

      return new Response(JSON.stringify({ success: true, data }), {
        status: 200,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    return new Response(JSON.stringify({ success: false, error: 'Unknown action' }), {
      status: 400,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    return new Response(JSON.stringify({ success: false, error: msg }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});
