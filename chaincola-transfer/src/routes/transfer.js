const express = require('express');
const axios = require('axios');
const router = express.Router();
const { validateConfig, getHeaders, getApiBase } = require('../config/flutterwave');
const { requireAdminFromBearer, requireUserFromBearer } = require('../supabase');

/** Max wait for Flutterwave /transfers (server returns 502 before mobile client times out). */
const FLUTTERWAVE_TRANSFERS_TIMEOUT_MS = 70_000;

function normalizeFlutterwaveBody(fwJson) {
  const st = fwJson && fwJson.status;
  return {
    success: st === 'success',
    message: (fwJson && fwJson.message) || undefined,
    data: (fwJson && fwJson.data) || undefined,
    error: st === 'error' ? ((fwJson && fwJson.message) || 'Transfer error') : undefined,
  };
}

async function safeInsertTransferEvent(supabase, row) {
  try {
    await supabase.from('flutterwave_transfer_events').insert(row);
  } catch {
    // table may not exist yet
  }
}

async function insertWithdrawalTx(supabase, row) {
  await supabase.from('withdrawal_transactions').insert(row).catch(() => {});
}

// Validate Flutterwave configuration on module load
try {
  validateConfig();
} catch (error) {
  console.warn('⚠️  Flutterwave configuration warning:', error.message);
  console.warn('   Please set FLUTTERWAVE_SECRET_KEY and FLUTTERWAVE_PUBLIC_KEY in .env file');
  console.warn('   Get keys from Supabase Dashboard > Settings > Edge Functions > Secrets');
}

/**
 * Initiate a Flutterwave transfer
 * POST /api/transfer
 * 
 * Body:
 * {
 *   "account_bank": "044", // Bank code
 *   "account_number": "0690000031", // Account number
 *   "amount": 500, // Amount in NGN
 *   "narration": "Payment for services",
 *   "currency": "NGN",
 *   "reference": "unique-ref-123", // Optional: unique reference
 *   "beneficiary_name": "John Doe" // Optional
 * }
 */
router.post('/', async (req, res) => {
  try {
    // Validate required fields
    const { account_bank, account_number, amount, narration, currency = 'NGN', reference, beneficiary_name } = req.body;

    if (!account_bank || !account_number || !amount || !narration) {
      return res.status(400).json({
        success: false,
        error: 'Missing required fields: account_bank, account_number, amount, narration'
      });
    }

    // Validate configuration
    try {
      validateConfig();
    } catch (error) {
      return res.status(500).json({
        success: false,
        error: 'Flutterwave API credentials not configured',
        message: 'Please set FLUTTERWAVE_SECRET_KEY and FLUTTERWAVE_PUBLIC_KEY in .env file'
      });
    }

    // Validate amount
    if (amount <= 0) {
      return res.status(400).json({
        success: false,
        error: 'Amount must be greater than 0'
      });
    }

    // Generate unique reference if not provided
    const transferReference = reference || `CHAINCOLA-${Date.now()}-${Math.random().toString(36).substring(7)}`;

    // Prepare Flutterwave transfer payload
    const transferPayload = {
      account_bank: account_bank.toString(),
      account_number: account_number.toString(),
      amount: parseFloat(amount),
      narration: narration,
      currency: currency,
      reference: transferReference,
      beneficiary_name: beneficiary_name || '',
      callback_url: process.env.FLUTTERWAVE_TRANSFER_CALLBACK_URL || '',
      debit_currency: currency
    };

    console.log(`📤 Initiating Flutterwave transfer:`, {
      reference: transferReference,
      account_bank,
      account_number: account_number.substring(0, 4) + '****',
      amount,
      currency
    });

    // Call Flutterwave API to initiate transfer
    const response = await axios.post(
      `${getApiBase()}/transfers`,
      transferPayload,
      {
        headers: getHeaders()
      }
    );

    if (response.data.status === 'success') {
      const transferData = response.data.data;

      console.log(`✅ Transfer initiated successfully:`, {
        id: transferData.id,
        reference: transferReference,
        status: transferData.status
      });

      return res.json({
        success: true,
        data: {
          transfer_id: transferData.id,
          reference: transferReference,
          amount: transferData.amount,
          currency: transferData.currency,
          status: transferData.status,
          account_number: account_number.substring(0, 4) + '****',
          account_bank: account_bank,
          narration: narration,
          created_at: transferData.created_at,
          complete_message: transferData.complete_message
        }
      });
    } else {
      console.error('❌ Flutterwave transfer failed:', response.data.message);
      return res.status(400).json({
        success: false,
        error: response.data.message || 'Transfer initiation failed',
        details: response.data
      });
    }
  } catch (error) {
    console.error('❌ Error initiating transfer:', error.message);
    
    if (error.response) {
      // Flutterwave API error
      return res.status(error.response.status || 500).json({
        success: false,
        error: error.response.data?.message || 'Transfer initiation failed',
        details: error.response.data
      });
    }

    return res.status(500).json({
      success: false,
      error: error.message || 'Internal server error'
    });
  }
});

/**
 * USER-LEVEL: Initiate a Flutterwave transfer for the caller's own withdrawals row.
 * Mirrors the legacy Supabase Edge Function `flutterwave-transfer` (POST) so the
 * mobile/web client only needs to swap the base URL.
 *
 * POST /api/transfer/initiate
 *
 * Headers:
 *   Authorization: Bearer <supabase_user_access_token>
 *
 * Body:
 *   { "withdrawal_id": "<uuid>", "narration"?: string, "callback_url"?: string }
 *
 * The wallet debit is expected to have already been performed by the client
 * (matching the legacy edge-function behaviour). This endpoint only:
 *   1. authenticates the user,
 *   2. loads the caller's own withdrawals row,
 *   3. calls Flutterwave /transfers, and
 *   4. updates withdrawals.transfer_id / transfer_reference.
 */
router.post('/initiate', async (req, res) => {
  try {
    const { supabase, user, isAdmin } = await requireUserFromBearer(req);

    const { withdrawal_id, narration, callback_url } = req.body || {};
    const withdrawalId = String(withdrawal_id || '').trim();
    if (!withdrawalId) {
      return res.status(400).json({ success: false, error: 'withdrawal_id is required' });
    }

    let q = supabase
      .from('withdrawals')
      .select(
        'id, user_id, amount, bank_code, account_number, status, currency, transfer_id, transfer_reference, metadata',
      )
      .eq('id', withdrawalId);
    if (!isAdmin) q = q.eq('user_id', user.id);

    const { data: w, error: wErr } = await q.maybeSingle();
    if (wErr || !w) {
      return res.status(404).json({ success: false, error: 'Withdrawal not found' });
    }

    if (String(w.status).toLowerCase() !== 'processing') {
      return res.status(400).json({
        success: false,
        error: `Withdrawal is not in processing state (current: ${w.status})`,
      });
    }

    // Idempotency: if a transfer is already attached, return the existing one
    // in the same shape Flutterwave would return.
    if (w.transfer_id) {
      return res.json({
        success: true,
        data: {
          id: w.transfer_id,
          reference: w.transfer_reference || `wd-${withdrawalId}`,
          status: 'PENDING',
          amount: Number(w.amount),
          currency: String(w.currency || 'NGN').toUpperCase(),
          message: 'Transfer already initiated for this withdrawal',
        },
      });
    }

    const accountBank = String(w.bank_code || '').trim();
    const accountNumber = String(w.account_number || '').trim();
    const amount = Number(w.amount);
    const currency = String(w.currency || 'NGN').toUpperCase();

    if (!accountBank || !accountNumber || !Number.isFinite(amount) || amount <= 0) {
      return res.status(400).json({ success: false, error: 'Invalid withdrawal bank or amount' });
    }

    try {
      validateConfig();
    } catch {
      return res.status(500).json({ success: false, error: 'Flutterwave API credentials not configured' });
    }

    const reference = `wd-${withdrawalId}`;
    const fwPayload = {
      account_bank: accountBank,
      account_number: accountNumber,
      amount: Math.round(amount * 100) / 100,
      narration: narration || `Withdrawal ${withdrawalId.slice(0, 8)}`,
      currency,
      reference,
      callback_url: callback_url || process.env.FLUTTERWAVE_TRANSFER_CALLBACK_URL || undefined,
      debit_currency: currency,
    };

    let fwJson;
    let fwStatus = 200;
    try {
      const fwRes = await axios.post(`${getApiBase()}/transfers`, fwPayload, {
        headers: getHeaders(),
        validateStatus: () => true,
        timeout: FLUTTERWAVE_TRANSFERS_TIMEOUT_MS,
      });
      fwStatus = fwRes.status;
      fwJson = fwRes.data;
    } catch (e) {
      if (e.response) {
        fwStatus = e.response.status || 502;
        fwJson = e.response.data || { status: 'error', message: e.message };
      } else {
        return res.status(502).json({ success: false, error: e.message || 'Network error calling Flutterwave' });
      }
    }

    const data = fwJson && fwJson.data;
    if (fwStatus < 400 && fwJson && fwJson.status === 'success' && data && data.id != null) {
      try {
        await supabase
          .from('withdrawals')
          .update({
            transfer_id: String(data.id),
            transfer_reference: data.reference || reference,
            updated_at: new Date().toISOString(),
            metadata: {
              ...(w.metadata || {}),
              transfer_initiated_at: new Date().toISOString(),
              transfer_initiated_by: user.id,
              transfer_initiated_via: 'chaincola-transfer',
            },
          })
          .eq('id', withdrawalId)
          .eq('user_id', w.user_id);
      } catch (updateErr) {
        console.error('⚠️  Failed to persist transfer_id on withdrawal:', updateErr?.message || updateErr);
      }
    }

    const normalized = normalizeFlutterwaveBody(fwJson || {});
    const httpStatus = fwStatus < 400 && normalized.success ? 200 : fwStatus || 400;
    return res.status(httpStatus).json(normalized);
  } catch (e) {
    const status = e?.statusCode || 500;
    return res.status(status).json({ success: false, error: e?.message || 'Internal server error' });
  }
});

/**
 * USER-LEVEL: Check Flutterwave transfer status for the caller's own withdrawal.
 *
 * GET /api/transfer/initiate?id=<flutterwave_transfer_id>
 *
 * Headers:
 *   Authorization: Bearer <supabase_user_access_token>
 */
router.get('/initiate', async (req, res) => {
  try {
    const { supabase, user, isAdmin } = await requireUserFromBearer(req);

    const transferId = String(req.query.id || '').trim();
    if (!transferId) {
      return res.status(400).json({ success: false, error: 'Missing transfer id' });
    }

    // Confirm the transfer belongs to the caller (admins can look up any)
    if (!isAdmin) {
      const { data: w } = await supabase
        .from('withdrawals')
        .select('id, user_id, transfer_id')
        .eq('user_id', user.id)
        .eq('transfer_id', transferId)
        .maybeSingle();
      if (!w) {
        return res.status(404).json({ success: false, error: 'Transfer not found' });
      }
    }

    try {
      validateConfig();
    } catch {
      return res.status(500).json({ success: false, error: 'Flutterwave API credentials not configured' });
    }

    let fwJson;
    let fwStatus = 200;
    try {
      const fwRes = await axios.get(`${getApiBase()}/transfers/${encodeURIComponent(transferId)}`, {
        headers: getHeaders(),
        validateStatus: () => true,
      });
      fwStatus = fwRes.status;
      fwJson = fwRes.data;
    } catch (e) {
      if (e.response) {
        fwStatus = e.response.status || 502;
        fwJson = e.response.data || { status: 'error', message: e.message };
      } else {
        return res.status(502).json({ success: false, error: e.message || 'Network error calling Flutterwave' });
      }
    }

    const normalized = normalizeFlutterwaveBody(fwJson || {});
    const httpStatus = fwStatus < 400 && normalized.success ? 200 : fwStatus || 400;
    return res.status(httpStatus).json(normalized);
  } catch (e) {
    const status = e?.statusCode || 500;
    return res.status(status).json({ success: false, error: e?.message || 'Internal server error' });
  }
});

/**
 * Get transfer status
 * GET /api/transfer/:transfer_id
 */
router.get('/:transfer_id', async (req, res) => {
  try {
    const { transfer_id } = req.params;

    // Validate configuration
    try {
      validateConfig();
    } catch (error) {
      return res.status(500).json({
        success: false,
        error: 'Flutterwave API credentials not configured'
      });
    }

    // Call Flutterwave API to get transfer status
    const response = await axios.get(
      `${getApiBase()}/transfers/${transfer_id}`,
      {
        headers: getHeaders()
      }
    );

    if (response.data.status === 'success') {
      return res.json({
        success: true,
        data: response.data.data
      });
    } else {
      return res.status(400).json({
        success: false,
        error: response.data.message || 'Failed to fetch transfer status'
      });
    }
  } catch (error) {
    console.error('❌ Error fetching transfer status:', error.message);
    
    if (error.response) {
      return res.status(error.response.status || 500).json({
        success: false,
        error: error.response.data?.message || 'Failed to fetch transfer status',
        details: error.response.data
      });
    }

    return res.status(500).json({
      success: false,
      error: error.message || 'Internal server error'
    });
  }
});

/**
 * Get all transfers
 * GET /api/transfer
 * Query params: page, status, from, to
 */
router.get('/', async (req, res) => {
  try {
    const { page = 1, status, from, to } = req.query;

    // Validate configuration
    try {
      validateConfig();
    } catch (error) {
      return res.status(500).json({
        success: false,
        error: 'Flutterwave API credentials not configured'
      });
    }

    // Build query parameters
    const params = new URLSearchParams();
    if (page) params.append('page', page);
    if (status) params.append('status', status);
    if (from) params.append('from', from);
    if (to) params.append('to', to);

    // Call Flutterwave API to get transfers
    const response = await axios.get(
      `${getApiBase()}/transfers?${params.toString()}`,
      {
        headers: getHeaders()
      }
    );

    if (response.data.status === 'success') {
      return res.json({
        success: true,
        data: response.data.data,
        meta: response.data.meta
      });
    } else {
      return res.status(400).json({
        success: false,
        error: response.data.message || 'Failed to fetch transfers'
      });
    }
  } catch (error) {
    console.error('❌ Error fetching transfers:', error.message);
    
    if (error.response) {
      return res.status(error.response.status || 500).json({
        success: false,
        error: error.response.data?.message || 'Failed to fetch transfers',
        details: error.response.data
      });
    }

    return res.status(500).json({
      success: false,
      error: error.message || 'Internal server error'
    });
  }
});

/**
 * Initiate a Flutterwave transfer for an existing Supabase `withdrawals` row (admin-only)
 * POST /api/transfer/withdrawal
 *
 * Headers:
 *   Authorization: Bearer <supabase_user_access_token>
 *
 * Body:
 * { "withdrawal_id": "<uuid>", "narration"?: string, "callback_url"?: string }
 */
router.post('/withdrawal', async (req, res) => {
  try {
    const { supabase, user } = await requireAdminFromBearer(req);

    const { withdrawal_id, narration, callback_url } = req.body || {};
    const withdrawalId = String(withdrawal_id || '').trim();
    if (!withdrawalId) {
      return res.status(400).json({ success: false, error: 'withdrawal_id is required' });
    }

    // Load withdrawal (admin can initiate for any user)
    const { data: w, error: wErr } = await supabase
      .from('withdrawals')
      .select('id, user_id, amount, bank_code, account_number, status, currency, transfer_id, transfer_reference, metadata')
      .eq('id', withdrawalId)
      .single();

    if (wErr || !w) {
      return res.status(404).json({ success: false, error: 'Withdrawal not found' });
    }

    if (String(w.status).toLowerCase() !== 'processing') {
      return res.status(400).json({
        success: false,
        error: `Withdrawal is not in processing state (current: ${w.status})`,
      });
    }

    // Idempotency: if transfer already initiated, return existing identifiers.
    if (w.transfer_id) {
      return res.json({
        success: true,
        data: {
          withdrawal_id: withdrawalId,
          transfer_id: String(w.transfer_id),
          reference: String(w.transfer_reference || `wd-${withdrawalId}`),
          status: 'initiated',
          message: 'Transfer already initiated for this withdrawal',
        },
      });
    }

    // Prepare Flutterwave payload (same shape as your Supabase edge function)
    const accountBank = String(w.bank_code || '').trim();
    const accountNumber = String(w.account_number || '').trim();
    const amount = Number(w.amount);
    const currency = String(w.currency || 'NGN').toUpperCase();

    if (!accountBank || !accountNumber || !Number.isFinite(amount) || amount <= 0) {
      return res.status(400).json({ success: false, error: 'Invalid withdrawal bank or amount' });
    }

    // Validate flutterwave env keys
    try {
      validateConfig();
    } catch {
      return res.status(500).json({ success: false, error: 'Flutterwave API credentials not configured' });
    }

    const reference = `wd-${withdrawalId}`;
    const payload = {
      account_bank: accountBank,
      account_number: accountNumber,
      amount: Math.round(amount * 100) / 100,
      narration: narration || `Withdrawal ${withdrawalId.slice(0, 8)}`,
      currency,
      reference,
      callback_url: callback_url || process.env.FLUTTERWAVE_TRANSFER_CALLBACK_URL || '',
      debit_currency: currency,
    };

    // Ensure wallet is debited (idempotent via withdrawal_transactions "debit" record).
    const { data: debitRows } = await supabase
      .from('withdrawal_transactions')
      .select('id, status')
      .eq('withdrawal_id', withdrawalId)
      .eq('transaction_type', 'debit')
      .order('created_at', { ascending: false })
      .limit(1);
    const alreadyDebited = Array.isArray(debitRows) && debitRows.some((r) => String(r.status) === 'completed');
    if (!alreadyDebited) {
      const debitAmount = Math.round(amount * 100) / 100;
      const { data: debitOk, error: debitErr } = await supabase.rpc('debit_wallet', {
        p_user_id: w.user_id,
        p_amount: debitAmount,
        p_currency: currency,
      });
      if (debitErr) {
        return res.status(400).json({ success: false, error: debitErr.message || 'Failed to debit wallet' });
      }
      if (debitOk === false) {
        return res.status(400).json({ success: false, error: 'Failed to debit wallet (debit_wallet returned false)' });
      }
      await insertWithdrawalTx(supabase, {
        withdrawal_id: withdrawalId,
        user_id: w.user_id,
        transaction_type: 'debit',
        amount: debitAmount,
        currency,
        status: 'completed',
        description: 'Withdrawal debit',
        metadata: { source: 'chaincola-transfer' },
        completed_at: new Date().toISOString(),
      });
    }

    await safeInsertTransferEvent(supabase, {
      withdrawal_id: withdrawalId,
      user_id: w.user_id,
      reference,
      event_type: 'transfer_init',
      status: 'processing',
      payload: { request: payload },
    });

    const fwRes = await axios.post(`${getApiBase()}/transfers`, payload, { headers: getHeaders() });
    const fw = fwRes.data || {};

    if (fw.status !== 'success' || !fw.data?.id) {
      await safeInsertTransferEvent(supabase, {
        withdrawal_id: withdrawalId,
        user_id: w.user_id,
        reference,
        event_type: 'transfer_failed',
        status: 'failed',
        payload: { response: fw },
      });
      return res.status(400).json({
        success: false,
        error: fw.message || 'Transfer initiation failed',
        details: fw,
      });
    }

    const transferId = String(fw.data.id);
    const transferRef = String(fw.data.reference || reference);

    await supabase
      .from('withdrawals')
      .update({
        transfer_id: transferId,
        transfer_reference: transferRef,
        updated_at: new Date().toISOString(),
        metadata: {
          ...(w.metadata || {}),
          transfer_initiated_at: new Date().toISOString(),
          transfer_initiated_by: user.id,
        },
      })
      .eq('id', withdrawalId);

    await insertWithdrawalTx(supabase, {
      withdrawal_id: withdrawalId,
      user_id: w.user_id,
      transaction_type: 'transfer_init',
      amount: Math.round(amount * 100) / 100,
      currency,
      status: 'completed',
      external_transaction_id: transferId,
      external_reference: transferRef,
      description: 'Flutterwave transfer initiated',
      metadata: { flutterwave: fw.data, reference: transferRef, source: 'chaincola-transfer' },
      completed_at: new Date().toISOString(),
    });

    await safeInsertTransferEvent(supabase, {
      withdrawal_id: withdrawalId,
      user_id: w.user_id,
      transfer_id: transferId,
      reference: transferRef,
      event_type: 'transfer_init',
      status: String(fw.data.status || 'processing'),
      payload: { response: fw },
    });

    // Optional audit trail
    await supabase
      .from('admin_action_logs')
      .insert({
        admin_user_id: user.id,
        action_type: 'flutterwave_transfer_initiated',
        action_details: {
          withdrawal_id: withdrawalId,
          transfer_id: transferId,
          reference: transferRef,
          amount,
          currency,
        },
      })
      .catch(() => {});

    return res.json({
      success: true,
      data: {
        withdrawal_id: withdrawalId,
        transfer_id: transferId,
        reference: transferRef,
        status: fw.data.status,
        amount: fw.data.amount,
        currency: fw.data.currency,
        created_at: fw.data.created_at,
        complete_message: fw.data.complete_message,
      },
    });
  } catch (e) {
    const status = e?.statusCode || 500;
    return res.status(status).json({ success: false, error: e?.message || 'Internal server error' });
  }
});

/**
 * Transfer callback/webhook endpoint (Flutterwave -> ChainCola)
 * POST /api/transfer/callback
 *
 * Flutterwave includes `verif-hash` header, we compare to FLUTTERWAVE_SECRET_HASH if set.
 * For safety, we only update withdrawals that match reference: wd-<withdrawal_id>.
 */
router.post('/callback', async (req, res) => {
  try {
    const expected = (process.env.FLUTTERWAVE_SECRET_HASH || '').trim();
    if (expected) {
      const got = String(req.headers['verif-hash'] || req.headers['Verif-Hash'] || '').trim();
      if (!got || got !== expected) {
        return res.status(401).json({ success: false, error: 'Unauthorized' });
      }
    }

    const { getSupabaseAdminClient } = require('../supabase');
    const supabase = getSupabaseAdminClient();

    const payload = req.body || {};
    const data = payload.data || payload;
    const reference = String(data.reference || '').trim();
    const status = String(data.status || '').toLowerCase();
    const transferId = data.id != null ? String(data.id) : null;

    if (!reference || !reference.startsWith('wd-')) {
      return res.status(200).json({ success: true, message: 'ignored' });
    }

    const withdrawalId = reference.slice('wd-'.length);
    if (!withdrawalId) return res.status(200).json({ success: true, message: 'ignored' });

    // Load withdrawal (for user_id + amount + existing state)
    const { data: w } = await supabase
      .from('withdrawals')
      .select('id, user_id, amount, currency, status, metadata, transfer_id, transfer_reference')
      .eq('id', withdrawalId)
      .maybeSingle();

    await safeInsertTransferEvent(supabase, {
      withdrawal_id: withdrawalId,
      user_id: w?.user_id || null,
      transfer_id: transferId || w?.transfer_id || null,
      reference,
      event_type: 'callback_received',
      status: status || null,
      payload,
    });

    // Map Flutterwave statuses to your withdrawals statuses (best-effort)
    let newStatus = null;
    if (status === 'successful' || status === 'success') newStatus = 'completed';
    if (status === 'failed') newStatus = 'failed';

    if (!newStatus) {
      // Keep as processing for intermediate statuses
      return res.status(200).json({ success: true, message: 'no-op' });
    }

    const currentStatus = String(w?.status || '').toLowerCase();
    if (currentStatus === 'completed' || currentStatus === 'failed' || currentStatus === 'cancelled') {
      return res.status(200).json({ success: true, message: 'already terminal' });
    }

    await supabase
      .from('withdrawals')
      .update({
        status: newStatus,
        transfer_id: transferId || w?.transfer_id || undefined,
        transfer_reference: w?.transfer_reference || reference,
        updated_at: new Date().toISOString(),
        metadata: {
          ...(w?.metadata || {}),
          flutterwave_callback: payload,
          callback_received_at: new Date().toISOString(),
        },
      })
      .eq('id', withdrawalId);

    // Record transfer completion/failure
    if (w?.user_id) {
      const amt = Math.round(Number(w.amount || 0) * 100) / 100;
      const cur = String(w.currency || 'NGN').toUpperCase();
      await insertWithdrawalTx(supabase, {
        withdrawal_id: withdrawalId,
        user_id: w.user_id,
        transaction_type: 'transfer_complete',
        amount: amt,
        currency: cur,
        status: newStatus === 'completed' ? 'completed' : 'failed',
        external_transaction_id: transferId || w.transfer_id || null,
        external_reference: reference,
        description: `Flutterwave transfer ${newStatus}`,
        metadata: { flutterwave: payload, source: 'chaincola-transfer' },
        completed_at: new Date().toISOString(),
      });
    }

    // Refund on failure (idempotent)
    if (newStatus === 'failed' && w?.user_id) {
      const { data: refundRows } = await supabase
        .from('withdrawal_transactions')
        .select('id, status')
        .eq('withdrawal_id', withdrawalId)
        .eq('transaction_type', 'refund')
        .order('created_at', { ascending: false })
        .limit(1);
      const alreadyRefunded = Array.isArray(refundRows) && refundRows.some((r) => String(r.status) === 'completed');

      if (!alreadyRefunded) {
        const refundAmount = Math.round(Number(w.amount || 0) * 100) / 100;
        const cur = String(w.currency || 'NGN').toUpperCase();
        const { data: creditOk, error: creditErr } = await supabase.rpc('credit_wallet', {
          p_user_id: w.user_id,
          p_amount: refundAmount,
          p_currency: cur,
        });
        if (!creditErr && creditOk !== false) {
          await insertWithdrawalTx(supabase, {
            withdrawal_id: withdrawalId,
            user_id: w.user_id,
            transaction_type: 'refund',
            amount: refundAmount,
            currency: cur,
            status: 'completed',
            description: 'Refund withdrawal after failed transfer',
            metadata: { source: 'chaincola-transfer', flutterwave: payload },
            completed_at: new Date().toISOString(),
          });
          await safeInsertTransferEvent(supabase, {
            withdrawal_id: withdrawalId,
            user_id: w.user_id,
            transfer_id: transferId || w.transfer_id || null,
            reference,
            event_type: 'refund_issued',
            status: 'completed',
            payload: { refund_amount: refundAmount, currency: cur },
          });
        }
      }
    }

    return res.status(200).json({ success: true });
  } catch (e) {
    return res.status(500).json({ success: false, error: e?.message || 'Internal server error' });
  }
});

module.exports = router;
