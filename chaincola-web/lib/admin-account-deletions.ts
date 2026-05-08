import { createClient } from '@/lib/supabase/client';

export type AccountDeletionRow = {
  id: string;
  user_id: string;
  reason: string | null;
  status: string;
  requested_at: string;
  scheduled_deletion_at: string;
  processed_at: string | null;
  created_at: string;
  updated_at: string;
};

export type UserProfileBrief = {
  user_id: string;
  email: string | null;
  full_name: string | null;
  phone_number: string | null;
};

export type AccountDeletionAuditSnapshot = {
  deletion: AccountDeletionRow;
  profile: UserProfileBrief | null;
  /** Activities on or before the user submitted the deletion request */
  activityCutoffIso: string;
  transactions: Record<string, unknown>[];
  withdrawals: Record<string, unknown>[];
  supportTickets: Record<string, unknown>[];
  supportMessages: Record<string, unknown>[];
  referralsAsReferrer: Record<string, unknown>[];
  referralsAsReferred: Record<string, unknown>[];
  giftCardSales: Record<string, unknown>[];
  notifications: Record<string, unknown>[];
  cryptoWallets: Record<string, unknown>[];
  walletBalances: Record<string, unknown>[];
  adminActionsOnUser: Record<string, unknown>[];
  fetchWarnings: string[];
};

const ACTIVITY_LIMIT = 400;
const TICKET_LIMIT = 80;

function ensureSession(): ReturnType<typeof createClient> {
  return createClient();
}

export async function listAccountDeletionsWithProfiles(options: {
  status?: string;
  limit?: number;
}): Promise<{
  rows: (AccountDeletionRow & { profile: UserProfileBrief | null })[];
  error: string | null;
}> {
  const supabase = ensureSession();
  const limit = Math.min(options.limit ?? 150, 500);

  let q = supabase
    .from('account_deletions')
    .select('*')
    .order('requested_at', { ascending: false })
    .limit(limit);

  if (options.status && options.status !== 'all') {
    q = q.eq('status', options.status);
  }

  const { data: deletions, error } = await q;
  if (error) {
    return { rows: [], error: error.message };
  }

  const list = (deletions || []) as AccountDeletionRow[];
  const userIds = [...new Set(list.map((d) => d.user_id))];

  let profileMap = new Map<string, UserProfileBrief>();
  if (userIds.length > 0) {
    const { data: profiles, error: pe } = await supabase
      .from('user_profiles')
      .select('user_id, email, full_name, phone_number')
      .in('user_id', userIds);

    if (pe) {
      console.warn('admin account deletions: profile batch error', pe.message);
    } else {
      for (const p of profiles || []) {
        profileMap.set(p.user_id as string, p as UserProfileBrief);
      }
    }
  }

  const rows = list.map((d) => ({
    ...d,
    profile: profileMap.get(d.user_id) ?? null,
  }));

  return { rows, error: null };
}

export async function fetchAccountDeletionAuditSnapshot(
  deletionId: string,
): Promise<{ snapshot: AccountDeletionAuditSnapshot | null; error: string | null }> {
  const supabase = ensureSession();
  const warnings: string[] = [];

  const { data: del, error: delErr } = await supabase
    .from('account_deletions')
    .select('*')
    .eq('id', deletionId)
    .maybeSingle();

  if (delErr) {
    return { snapshot: null, error: delErr.message };
  }
  if (!del) {
    return { snapshot: null, error: 'Deletion request not found' };
  }

  const deletion = del as AccountDeletionRow;
  const uid = deletion.user_id;
  const cutoff = deletion.requested_at;

  const { data: profile } = await supabase
    .from('user_profiles')
    .select('user_id, email, full_name, phone_number')
    .eq('user_id', uid)
    .maybeSingle();

  const [
    txRes,
    wdRes,
    ticketsRes,
    refOutRes,
    refInRes,
    giftRes,
    notifRes,
    walletsRes,
    balRes,
    adminRes,
  ] = await Promise.all([
    supabase
      .from('transactions')
      .select('*')
      .eq('user_id', uid)
      .lte('created_at', cutoff)
      .order('created_at', { ascending: false })
      .limit(ACTIVITY_LIMIT),
    supabase
      .from('withdrawals')
      .select('*')
      .eq('user_id', uid)
      .lte('created_at', cutoff)
      .order('created_at', { ascending: false })
      .limit(ACTIVITY_LIMIT),
    supabase
      .from('support_tickets')
      .select('id, subject, status, category, priority, created_at, last_message_at')
      .eq('user_id', uid)
      .lte('created_at', cutoff)
      .order('created_at', { ascending: false })
      .limit(TICKET_LIMIT),
    supabase
      .from('referrals')
      .select('*')
      .eq('referrer_user_id', uid)
      .lte('created_at', cutoff)
      .order('created_at', { ascending: false })
      .limit(200),
    supabase
      .from('referrals')
      .select('*')
      .eq('referred_user_id', uid)
      .lte('created_at', cutoff)
      .order('created_at', { ascending: false })
      .limit(200),
    supabase
      .from('gift_card_sales')
      .select('*')
      .eq('user_id', uid)
      .lte('created_at', cutoff)
      .order('created_at', { ascending: false })
      .limit(200),
    supabase
      .from('notifications')
      .select('id, title, message, type, status, created_at')
      .eq('user_id', uid)
      .lte('created_at', cutoff)
      .order('created_at', { ascending: false })
      .limit(200),
    supabase
      .from('crypto_wallets')
      .select('id, asset, network, address, destination_tag, is_active, created_at')
      .eq('user_id', uid),
    supabase
      .from('wallet_balances')
      .select('currency, balance, locked_balance, locked, updated_at, created_at')
      .eq('user_id', uid),
    supabase
      .from('admin_action_logs')
      .select('id, action_type, admin_user_id, action_details, created_at')
      .eq('target_user_id', uid)
      .lte('created_at', cutoff)
      .order('created_at', { ascending: false })
      .limit(100),
  ]);

  const agg = [
    ['transactions', txRes.error],
    ['withdrawals', wdRes.error],
    ['support_tickets', ticketsRes.error],
    ['referrals (out)', refOutRes.error],
    ['referrals (in)', refInRes.error],
    ['gift_card_sales', giftRes.error],
    ['notifications', notifRes.error],
    ['crypto_wallets', walletsRes.error],
    ['wallet_balances', balRes.error],
    ['admin_action_logs', adminRes.error],
  ] as const;

  for (const [name, err] of agg) {
    if (err) warnings.push(`${name}: ${err.message}`);
  }

  const ticketIds = (ticketsRes.data || []).map((t: { id: string }) => t.id);
  let supportMessages: Record<string, unknown>[] = [];
  if (ticketIds.length > 0) {
    const { data: msgs, error: msgErr } = await supabase
      .from('support_messages')
      .select('id, ticket_id, message, is_admin, created_at')
      .in('ticket_id', ticketIds)
      .lte('created_at', cutoff)
      .order('created_at', { ascending: true })
      .limit(500);

    if (msgErr) {
      warnings.push(`support_messages: ${msgErr.message}`);
    } else {
      supportMessages = (msgs || []) as Record<string, unknown>[];
    }
  }

  const snapshot: AccountDeletionAuditSnapshot = {
    deletion,
    profile: (profile as UserProfileBrief | null) ?? null,
    activityCutoffIso: cutoff,
    transactions: (txRes.data || []) as Record<string, unknown>[],
    withdrawals: (wdRes.data || []) as Record<string, unknown>[],
    supportTickets: (ticketsRes.data || []) as Record<string, unknown>[],
    supportMessages,
    referralsAsReferrer: (refOutRes.data || []) as Record<string, unknown>[],
    referralsAsReferred: (refInRes.data || []) as Record<string, unknown>[],
    giftCardSales: (giftRes.data || []) as Record<string, unknown>[],
    notifications: (notifRes.data || []) as Record<string, unknown>[],
    cryptoWallets: (walletsRes.data || []) as Record<string, unknown>[],
    walletBalances: (balRes.data || []) as Record<string, unknown>[],
    adminActionsOnUser: (adminRes.data || []) as Record<string, unknown>[],
    fetchWarnings: warnings,
  };

  return { snapshot, error: null };
}

function esc(s: string): string {
  return String(s)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function fmtIso(iso: string | null | undefined): string {
  if (!iso) return '—';
  try {
    return new Date(iso).toLocaleString();
  } catch {
    return iso;
  }
}

export function buildAccountDeletionReportHtml(s: AccountDeletionAuditSnapshot, generatedAt = new Date()): string {
  const d = s.deletion;
  const p = s.profile;
  const name = p?.full_name || '—';
  const email = p?.email || '—';
  const phone = p?.phone_number || '—';

  const txRows = s.transactions
    .map((t) => {
      const type = esc(String(t.transaction_type ?? t.type ?? ''));
      const st = esc(String(t.status ?? ''));
      const cur = esc(String(t.crypto_currency ?? t.fiat_currency ?? ''));
      const amt =
        t.crypto_amount != null
          ? String(t.crypto_amount)
          : t.fiat_amount != null
            ? String(t.fiat_amount)
            : '—';
      return `<tr><td>${fmtIso(t.created_at as string)}</td><td>${type}</td><td>${cur}</td><td>${esc(amt)}</td><td>${st}</td></tr>`;
    })
    .join('');

  const wdRows = s.withdrawals
    .map(
      (w) =>
        `<tr><td>${fmtIso(w.created_at as string)}</td><td>${esc(String(w.amount))}</td><td>${esc(String(w.currency))}</td><td>${esc(String(w.status))}</td><td>${esc(String(w.bank_name ?? ''))}</td></tr>`,
    )
    .join('');

  const ticketRows = s.supportTickets
    .map(
      (t) =>
        `<tr><td>${fmtIso(t.created_at as string)}</td><td>${esc(String(t.subject ?? ''))}</td><td>${esc(String(t.status))}</td><td>${esc(String(t.category ?? ''))}</td></tr>`,
    )
    .join('');

  const msgRows = s.supportMessages
    .map(
      (m) =>
        `<tr><td>${fmtIso(m.created_at as string)}</td><td>${esc(String(m.ticket_id)).slice(0, 8)}…</td><td>${(m.is_admin as boolean) ? 'Staff' : 'User'}</td><td>${esc(String(m.message ?? '').slice(0, 200))}${String(m.message ?? '').length > 200 ? '…' : ''}</td></tr>`,
    )
    .join('');

  const wallRows = s.cryptoWallets
    .map(
      (w) =>
        `<tr><td>${esc(String(w.asset))}</td><td>${esc(String(w.network))}</td><td>${esc(String(w.address ?? ''))}</td><td>${w.is_active === false ? 'inactive' : 'active'}</td></tr>`,
    )
    .join('');

  const notifRows = s.notifications
    .map(
      (n) =>
        `<tr><td>${fmtIso(n.created_at as string)}</td><td>${esc(String(n.title ?? ''))}</td><td>${esc(String(n.type ?? ''))}</td><td>${esc(String(n.status ?? ''))}</td><td>${esc(String(n.message ?? '').slice(0, 120))}${String(n.message ?? '').length > 120 ? '…' : ''}</td></tr>`,
    )
    .join('');

  const refOutRows = s.referralsAsReferrer
    .map(
      (r) =>
        `<tr><td>${fmtIso(r.created_at as string)}</td><td>${esc(String(r.referral_code ?? ''))}</td><td>${esc(String(r.referred_user_id ?? '')).slice(0, 8)}…</td><td>${esc(String(r.reward_amount))}</td><td>${esc(String(r.reward_status))}</td></tr>`,
    )
    .join('');

  const refInRows = s.referralsAsReferred
    .map(
      (r) =>
        `<tr><td>${fmtIso(r.created_at as string)}</td><td>${esc(String(r.referral_code ?? ''))}</td><td>${esc(String(r.referrer_user_id ?? '')).slice(0, 8)}…</td><td>${esc(String(r.reward_amount))}</td><td>${esc(String(r.reward_status))}</td></tr>`,
    )
    .join('');

  const giftRows = s.giftCardSales
    .map(
      (g) =>
        `<tr><td>${fmtIso(g.created_at as string)}</td><td>${esc(String(g.card_type ?? ''))}</td><td>${esc(String(g.amount))}</td><td>${esc(String(g.currency))}</td><td>${esc(String(g.status))}</td></tr>`,
    )
    .join('');

  const balRows = s.walletBalances
    .map(
      (b) =>
        `<tr><td>${esc(String(b.currency))}</td><td>${esc(String(b.balance ?? ''))}</td><td>${esc(String(b.locked_balance ?? b.locked ?? ''))}</td><td>${fmtIso(b.updated_at as string)}</td></tr>`,
    )
    .join('');

  const warnBlock =
    s.fetchWarnings.length > 0
      ? `<p style="color:#b45309;"><strong>Partial data:</strong> ${esc(s.fetchWarnings.join(' | '))}</p>`
      : '';

  return `<!DOCTYPE html><html><head><meta charset="utf-8"/>
<title>Account deletion audit — ${esc(email)}</title>
<style>
  body { font-family: system-ui, sans-serif; color:#111827; padding:24px; max-width:1000px; margin:0 auto; font-size:12px;}
  h1 { color:#4c1d95; font-size:20px; }
  h2 { font-size:14px; margin-top:28px; border-bottom:1px solid #e5e7eb; padding-bottom:6px; }
  table { width:100%; border-collapse: collapse; margin-top:8px; }
  th, td { border:1px solid #e5e7eb; padding:6px 8px; text-align:left; vertical-align:top; }
  th { background:#f3f4f6; }
  .muted { color:#6b7280; font-size:11px;}
  .box { background:#faf5ff; border:1px solid #ddd6fe; padding:12px 16px; border-radius:8px; margin:12px 0;}
</style></head><body>
<h1>Account deletion audit report</h1>
<p class="muted">Generated: ${fmtIso(generatedAt.toISOString())} • Report covers activity on or before deletion request (${fmtIso(d.requested_at)}).</p>
${warnBlock}
<div class="box">
<strong>Deletion request</strong><br/>
Request ID: ${esc(d.id)}<br/>
User ID: ${esc(d.user_id)}<br/>
Status: ${esc(d.status)}<br/>
<strong>Deletion requested at:</strong> ${fmtIso(d.requested_at)}<br/>
<strong>Scheduled account removal:</strong> ${fmtIso(d.scheduled_deletion_at)}<br/>
${d.processed_at ? `<strong>Processed at:</strong> ${fmtIso(d.processed_at)}<br/>` : ''}
Reason: ${esc(d.reason || '—')}
</div>
<div class="box">
<strong>Profile snapshot</strong><br/>
Name: ${esc(name)}<br/>
Email: ${esc(email)}<br/>
Phone: ${esc(phone)}
</div>

<h2>Transactions (up to ${s.transactions.length})</h2>
<table><thead><tr><th>Date</th><th>Type</th><th>Asset</th><th>Amount</th><th>Status</th></tr></thead><tbody>${txRows || '<tr><td colspan="5">No records</td></tr>'}</tbody></table>

<h2>Withdrawals (up to ${s.withdrawals.length})</h2>
<table><thead><tr><th>Date</th><th>Amount</th><th>Currency</th><th>Status</th><th>Bank</th></tr></thead><tbody>${wdRows || '<tr><td colspan="5">No records</td></tr>'}</tbody></table>

<h2>Support tickets (up to ${s.supportTickets.length})</h2>
<table><thead><tr><th>Created</th><th>Subject</th><th>Status</th><th>Category</th></tr></thead><tbody>${ticketRows || '<tr><td colspan="4">No records</td></tr>'}</tbody></table>

<h2>Support messages (up to ${s.supportMessages.length})</h2>
<table><thead><tr><th>Date</th><th>Ticket</th><th>From</th><th>Message (preview)</th></tr></thead><tbody>${msgRows || '<tr><td colspan="4">No records</td></tr>'}</tbody></table>

<h2>Referrals — as referrer (${s.referralsAsReferrer.length})</h2>
<table><thead><tr><th>Date</th><th>Code</th><th>Referred user</th><th>Reward</th><th>Status</th></tr></thead><tbody>${refOutRows || '<tr><td colspan="5">No records</td></tr>'}</tbody></table>

<h2>Referrals — as referred (${s.referralsAsReferred.length})</h2>
<table><thead><tr><th>Date</th><th>Code</th><th>Referrer user</th><th>Reward</th><th>Status</th></tr></thead><tbody>${refInRows || '<tr><td colspan="5">No records</td></tr>'}</tbody></table>

<h2>Gift card sales (up to ${s.giftCardSales.length})</h2>
<table><thead><tr><th>Date</th><th>Type</th><th>Amount</th><th>Currency</th><th>Status</th></tr></thead><tbody>${giftRows || '<tr><td colspan="5">No records</td></tr>'}</tbody></table>

<h2>Notifications (up to ${s.notifications.length})</h2>
<table><thead><tr><th>Date</th><th>Title</th><th>Type</th><th>Status</th><th>Message</th></tr></thead><tbody>${notifRows || '<tr><td colspan="5">No records</td></tr>'}</tbody></table>

<h2>Crypto wallet addresses (no private keys)</h2>
<table><thead><tr><th>Asset</th><th>Network</th><th>Address</th><th>State</th></tr></thead><tbody>${wallRows || '<tr><td colspan="4">No records</td></tr>'}</tbody></table>

<h2>Wallet balances (ledger)</h2>
<p class="muted">Latest ledger row per currency in database at report time (may have changed after the request).</p>
<table><thead><tr><th>Currency</th><th>Balance</th><th>Locked</th><th>Updated</th></tr></thead><tbody>${balRows || '<tr><td colspan="4">No records</td></tr>'}</tbody></table>

<h2>Admin actions involving this user (up to ${s.adminActionsOnUser.length})</h2>
<table><thead><tr><th>Date</th><th>Action</th><th>Admin user</th></tr></thead><tbody>
${s.adminActionsOnUser
  .map(
    (a) =>
      `<tr><td>${fmtIso(a.created_at as string)}</td><td>${esc(String(a.action_type))}</td><td>${esc(String(a.admin_user_id)).slice(0, 8)}…</td></tr>`,
  )
  .join('') || '<tr><td colspan="3">No records</td></tr>'}
</tbody></table>

<p class="muted" style="margin-top:32px;">ChainCola — confidential admin document</p>
</body></html>`;
}

/** Opens print dialog so the admin can save as PDF (browser &quot;Save as PDF&quot;). */
export function openAccountDeletionReportPrint(s: AccountDeletionAuditSnapshot): void {
  if (typeof window === 'undefined') return;
  const html = buildAccountDeletionReportHtml(s);
  const w = window.open('', '_blank');
  if (!w) {
    alert('Pop-up blocked. Allow pop-ups for this site to print / save PDF.');
    return;
  }
  w.document.open();
  w.document.write(html);
  w.document.close();
  setTimeout(() => {
    w.focus();
    w.print();
  }, 300);
}
