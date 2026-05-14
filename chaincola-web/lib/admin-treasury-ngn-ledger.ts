'use client';

import { createClient } from '@/lib/supabase/client';

export type TreasuryNgnBucketCode = 'PAYOUT_RESERVE' | 'FEE_REVENUE' | 'OPERATING_FLOAT';

export type TreasuryNgnBucketRow = {
  bucket_code: string;
  balance: number;
  updated_at: string;
};

export type TreasuryNgnLedgerRow = {
  id: string;
  created_at: string;
  bucket_code: string;
  delta: number;
  balance_after: number;
  category: string;
  reference_type: string | null;
  reference_id: string | null;
  user_id: string | null;
  metadata: Record<string, unknown> | null;
  created_by: string | null;
};

export const TREASURY_NGN_BUCKET_LABEL: Record<TreasuryNgnBucketCode, string> = {
  PAYOUT_RESERVE: 'Bank payout reserve',
  FEE_REVENUE: 'Withdrawal fee revenue',
  OPERATING_FLOAT: 'Operating float',
};

function parseNum(v: unknown): number {
  if (typeof v === 'number' && Number.isFinite(v)) return v;
  if (typeof v === 'string') {
    const n = parseFloat(v.replace(/,/g, ''));
    return Number.isFinite(n) ? n : 0;
  }
  return 0;
}

export async function fetchTreasuryNgnBuckets(): Promise<{
  data: TreasuryNgnBucketRow[] | null;
  error: string | null;
}> {
  try {
    const supabase = createClient();
    const { data, error } = await supabase
      .from('treasury_ngn_bucket_balances')
      .select('bucket_code, balance, updated_at')
      .order('bucket_code', { ascending: true });
    if (error) return { data: null, error: error.message };
    const rows = (data ?? []).map((r) => ({
      bucket_code: r.bucket_code,
      balance: parseNum(r.balance),
      updated_at: r.updated_at,
    }));
    return { data: rows, error: null };
  } catch (e) {
    return { data: null, error: (e as Error)?.message || 'Failed to load buckets' };
  }
}

export async function fetchTreasuryNgnLedger(limit = 100): Promise<{
  data: TreasuryNgnLedgerRow[] | null;
  error: string | null;
}> {
  try {
    const supabase = createClient();
    const { data, error } = await supabase
      .from('treasury_ngn_ledger')
      .select(
        'id, created_at, bucket_code, delta, balance_after, category, reference_type, reference_id, user_id, metadata, created_by',
      )
      .order('created_at', { ascending: false })
      .limit(Math.min(Math.max(limit, 1), 500));
    if (error) return { data: null, error: error.message };
    const rows = (data ?? []).map((r) => ({
      id: r.id,
      created_at: r.created_at,
      bucket_code: r.bucket_code,
      delta: parseNum(r.delta),
      balance_after: parseNum(r.balance_after),
      category: r.category,
      reference_type: r.reference_type,
      reference_id: r.reference_id,
      user_id: r.user_id,
      metadata: (r.metadata as Record<string, unknown>) ?? null,
      created_by: r.created_by,
    }));
    return { data: rows, error: null };
  } catch (e) {
    return { data: null, error: (e as Error)?.message || 'Failed to load ledger' };
  }
}

export async function adminTreasuryNgnMoveBetweenBuckets(params: {
  fromBucket: TreasuryNgnBucketCode;
  toBucket: TreasuryNgnBucketCode;
  amount: number;
  note?: string;
}): Promise<{ success: boolean; error?: string }> {
  try {
    const supabase = createClient();
    const { error } = await supabase.rpc('admin_treasury_ngn_move_between_buckets', {
      p_from_bucket: params.fromBucket,
      p_to_bucket: params.toBucket,
      p_amount: params.amount,
      p_note: params.note?.trim() || '',
    });
    if (error) return { success: false, error: error.message };
    return { success: true };
  } catch (e) {
    return { success: false, error: (e as Error)?.message || 'Move failed' };
  }
}
