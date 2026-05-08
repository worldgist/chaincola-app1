import { serve } from 'https://deno.land/std@0.168.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

const FW_BASE = 'https://api.flutterwave.com/v3';

function normalizeFlutterwaveBody(fwJson: Record<string, unknown>) {
  const st = fwJson.status as string | undefined;
  return {
    success: st === 'success',
    message: (fwJson.message as string) || undefined,
    data: fwJson.data as Record<string, unknown> | undefined,
    error: st === 'error' ? ((fwJson.message as string) || 'Transfer error') : undefined,
  };
}

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  try {
    const authHeader = req.headers.get('Authorization');
    if (!authHeader) {
      return new Response(JSON.stringify({ error: 'Missing authorization header' }), {
        status: 401,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    const supabase = createClient(supabaseUrl, supabaseServiceKey);

    const token = authHeader.replace('Bearer ', '');
    const {
      data: { user },
      error: userError,
    } = await supabase.auth.getUser(token);

    if (userError || !user) {
      return new Response(JSON.stringify({ error: 'Unauthorized' }), {
        status: 401,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const secretKey = Deno.env.get('FLUTTERWAVE_SECRET_KEY');
    if (!secretKey) {
      console.error('FLUTTERWAVE_SECRET_KEY is not set');
      return new Response(JSON.stringify({ error: 'Server configuration error' }), {
        status: 500,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const url = new URL(req.url);
    const pathParts = url.pathname.split('/').filter(Boolean);
    const lastSegment = pathParts[pathParts.length - 1];

    // GET .../flutterwave-transfer?id=123 — fetch transfer status
    if (req.method === 'GET') {
      let transferId = url.searchParams.get('id');
      if (!transferId && lastSegment && lastSegment !== 'flutterwave-transfer' && /^\d+$/.test(lastSegment)) {
        transferId = lastSegment;
      }
      if (!transferId) {
        return new Response(JSON.stringify({ error: 'Missing transfer id' }), {
          status: 400,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        });
      }

      const { data: withdrawal } = await supabase
        .from('withdrawals')
        .select('id, user_id, transfer_id')
        .eq('user_id', user.id)
        .eq('transfer_id', transferId)
        .maybeSingle();

      if (!withdrawal) {
        return new Response(JSON.stringify({ error: 'Transfer not found' }), {
          status: 404,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        });
      }

      const fwRes = await fetch(`${FW_BASE}/transfers/${transferId}`, {
        method: 'GET',
        headers: {
          Authorization: `Bearer ${secretKey}`,
          'Content-Type': 'application/json',
        },
      });

      let fwJson: Record<string, unknown>;
      try {
        fwJson = (await fwRes.json()) as Record<string, unknown>;
      } catch {
        return new Response(JSON.stringify({ success: false, error: 'Invalid response from payment provider' }), {
          status: 502,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        });
      }
      const normalized = normalizeFlutterwaveBody(fwJson);
      return new Response(JSON.stringify(normalized), {
        status: fwRes.ok && normalized.success ? 200 : fwRes.status || 400,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    if (req.method !== 'POST') {
      return new Response(JSON.stringify({ error: 'Method not allowed' }), {
        status: 405,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const body = await req.json();
    const withdrawalId = body.withdrawal_id as string | undefined;
    if (!withdrawalId) {
      return new Response(JSON.stringify({ error: 'withdrawal_id is required' }), {
        status: 400,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const { data: w, error: wErr } = await supabase
      .from('withdrawals')
      .select('id, user_id, amount, bank_code, account_number, status, currency')
      .eq('id', withdrawalId)
      .eq('user_id', user.id)
      .single();

    if (wErr || !w) {
      return new Response(JSON.stringify({ error: 'Withdrawal not found' }), {
        status: 404,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    if (w.status !== 'processing') {
      return new Response(
        JSON.stringify({ error: `Withdrawal is not in processing state (current: ${w.status})` }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
      );
    }

    const accountBank = String(w.bank_code || '').trim();
    const accountNumber = String(w.account_number || '').trim();
    const amount = Number(w.amount);
    const currency = (w.currency || 'NGN').toString().toUpperCase();

    if (!accountBank || !accountNumber || !Number.isFinite(amount) || amount <= 0) {
      return new Response(JSON.stringify({ error: 'Invalid withdrawal bank or amount' }), {
        status: 400,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const reference = `wd-${withdrawalId}`;

    const fwPayload = {
      account_bank: accountBank,
      account_number: accountNumber,
      amount: Math.round(amount * 100) / 100,
      narration: body.narration || `Withdrawal ${withdrawalId.slice(0, 8)}`,
      currency,
      reference,
      callback_url: body.callback_url || undefined,
    };

    const fwRes = await fetch(`${FW_BASE}/transfers`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${secretKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(fwPayload),
    });

    let fwJson: Record<string, unknown>;
    try {
      fwJson = (await fwRes.json()) as Record<string, unknown>;
    } catch {
      return new Response(JSON.stringify({ success: false, error: 'Invalid response from payment provider' }), {
        status: 502,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const data = fwJson.data as { id?: number | string; reference?: string } | undefined;
    if (fwRes.ok && fwJson.status === 'success' && data?.id != null) {
      await supabase
        .from('withdrawals')
        .update({
          transfer_id: String(data.id),
          transfer_reference: data.reference || reference,
          updated_at: new Date().toISOString(),
        })
        .eq('id', withdrawalId)
        .eq('user_id', user.id);
    }

    const normalized = normalizeFlutterwaveBody(fwJson);
    return new Response(JSON.stringify(normalized), {
      status: fwRes.ok && normalized.success ? 200 : fwRes.status || 400,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  } catch (e) {
    console.error('flutterwave-transfer error:', e);
    return new Response(JSON.stringify({ error: 'Internal server error' }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});
