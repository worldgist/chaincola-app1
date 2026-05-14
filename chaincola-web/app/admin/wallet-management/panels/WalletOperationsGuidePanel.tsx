'use client';

import Link from 'next/link';

const SECTION =
  'rounded-2xl border border-gray-200/80 bg-white shadow-sm shadow-gray-200/40 overflow-hidden';
const H3 = 'text-xs font-semibold uppercase tracking-wider text-gray-500';
const P = 'text-sm text-gray-600 leading-relaxed';

function FlowStep({ n, title, body, last }: { n: number; title: string; body: string; last?: boolean }) {
  return (
    <div className="flex gap-3">
      <div className="flex flex-col items-center shrink-0">
        <span className="flex h-8 w-8 items-center justify-center rounded-full bg-purple-600 text-xs font-bold text-white shadow-sm shadow-purple-500/30">
          {n}
        </span>
        {!last && <span className="mt-1 w-px flex-1 min-h-[12px] bg-gray-200" aria-hidden />}
      </div>
      <div className="pb-4 min-w-0">
        <p className="text-sm font-semibold text-gray-900">{title}</p>
        <p className={`${P} mt-0.5`}>{body}</p>
      </div>
    </div>
  );
}

function Pill({ children, tone }: { children: React.ReactNode; tone: 'slate' | 'emerald' | 'amber' | 'purple' }) {
  const tones = {
    slate: 'bg-gray-100 text-gray-700 ring-gray-200/80',
    emerald: 'bg-emerald-50 text-emerald-800 ring-emerald-200/60',
    amber: 'bg-amber-50 text-amber-900 ring-amber-200/60',
    purple: 'bg-purple-50 text-purple-900 ring-purple-200/60',
  };
  return (
    <span
      className={`inline-flex items-center rounded-full px-2.5 py-0.5 text-[11px] font-medium ring-1 ring-inset ${tones[tone]}`}
    >
      {children}
    </span>
  );
}

export default function WalletOperationsGuidePanel() {
  return (
    <div className="flex-1 min-h-0 overflow-y-auto overflow-x-hidden pb-8">
      <div className="rounded-2xl border border-purple-200/70 bg-gradient-to-br from-purple-50 via-white to-fuchsia-50/40 p-5 sm:p-7 mb-6 shadow-sm shadow-purple-100/50">
        <div className="flex flex-col lg:flex-row lg:items-end lg:justify-between gap-4">
          <div className="min-w-0">
            <p className="text-[11px] font-semibold uppercase tracking-widest text-purple-700">Operations reference</p>
            <h1 className="mt-1 text-xl sm:text-2xl font-bold tracking-tight text-gray-900">
              How wallet and treasury ledgers work
            </h1>
            <p className={`${P} mt-2 max-w-3xl`}>
              This console surfaces <strong className="text-gray-800">ledger state</strong> in Postgres (
              <code className="rounded bg-white/90 border border-purple-100/80 px-1 py-0.5 text-[11px]">user_wallets</code>,{' '}
              <code className="rounded bg-white/90 border border-purple-100/80 px-1 py-0.5 text-[11px]">wallet_balances</code>,{' '}
              <code className="rounded bg-white/90 border border-purple-100/80 px-1 py-0.5 text-[11px]">system_wallets</code>
              ). On-chain balances are separate; sweeps use deposit tooling and send functions.
            </p>
          </div>
          <div className="flex flex-wrap gap-2 shrink-0">
            <Pill tone="emerald">Atomic RPCs</Pill>
            <Pill tone="purple">Treasury id = 1</Pill>
            <Pill tone="amber">Ledger first</Pill>
          </div>
        </div>
      </div>

      <div className="grid gap-4 lg:grid-cols-3 mb-6">
        <div className={`${SECTION} p-5 border-l-4 border-l-purple-500`}>
          <p className={H3}>Hot inventory</p>
          <p className="mt-2 text-lg font-semibold text-gray-900">Instant buy pool</p>
          <p className={`${P} mt-2`}>
            Per-asset <code className="text-[11px]">*_inventory</code> on <code className="text-[11px]">system_wallets</code>{' '}
            backs retail <strong>instant buy</strong>. Buys debit this pool and credit the user in one transaction.
          </p>
        </div>
        <div className={`${SECTION} p-5 border-l-4 border-l-purple-400/80`}>
          <p className={H3}>Pending inventory</p>
          <p className="mt-2 text-lg font-semibold text-gray-900">Deposit custody bucket</p>
          <p className={`${P} mt-2`}>
            <code className="text-[11px]">*_pending_inventory</code> rises when on-chain deposits are credited via{' '}
            <code className="text-[11px]">credit_crypto_wallet</code>. Sells and swaps consume pending first so hot
            inventory is not double-counted.
          </p>
        </div>
        <div className={`${SECTION} p-5 border-l-4 border-l-fuchsia-400/70`}>
          <p className={H3}>NGN float</p>
          <p className="mt-2 text-lg font-semibold text-gray-900">Fiat liquidity</p>
          <p className={`${P} mt-2`}>
            <code className="text-[11px]">ngn_float_balance</code> moves with instant buy (in) and instant sell (out),
            subject to minimum reserve checks. Flutterwave balances appear where integrated in Crypto assets.
          </p>
        </div>
      </div>

      <div className="grid gap-4 lg:grid-cols-2 mb-6">
        <div className={`${SECTION}`}>
          <div className="border-b border-gray-100 bg-purple-50/50 px-5 py-3">
            <h2 className="text-sm font-bold text-gray-900">Instant buy</h2>
            <p className="text-[11px] text-gray-500 mt-0.5">NGN to crypto, internal ledger</p>
          </div>
          <div className="p-5 space-y-0">
            <FlowStep
              n={1}
              title="Available NGN check"
              body="Uses the greater of user_wallets vs wallet_balances NGN, minus any NGN locked on wallet_balances for in-flight operations."
            />
            <FlowStep
              n={2}
              title="Reserve and debit NGN"
              body="NGN row is locked; reserve recorded on wallet_balances, then user NGN is debited in the same atomic block."
            />
            <FlowStep
              n={3}
              title="Credit crypto and treasury"
              body="User receives crypto; system *_inventory decreases; ngn_float_balance increases; wallet_balances and wallets tables stay in sync."
              last
            />
            <div className="pl-11 pt-1">
              <p className="text-[11px] text-gray-500">
                Edge: <code className="rounded bg-gray-100 px-1">instant-buy-crypto</code> · RPC:{' '}
                <code className="rounded bg-gray-100 px-1">instant_buy_crypto</code>
              </p>
            </div>
          </div>
        </div>

        <div className={`${SECTION}`}>
          <div className="border-b border-gray-100 bg-purple-50/50 px-5 py-3">
            <h2 className="text-sm font-bold text-gray-900">Instant sell</h2>
            <p className="text-[11px] text-gray-500 mt-0.5">Crypto to NGN, internal ledger</p>
          </div>
          <div className="p-5 space-y-0">
            <FlowStep
              n={1}
              title="Available crypto"
              body="Greatest of user_wallets vs wallet_balances for the asset; minus locked on the asset row."
            />
            <FlowStep
              n={2}
              title="Reserve sell amount"
              body="wallet_balances.locked increased for the sold amount while rows are held with FOR UPDATE."
            />
            <FlowStep
              n={3}
              title="Settle NGN and treasury"
              body="User crypto debited; NGN credited; pending inventory consumed first, remainder to *_inventory; reserve released."
              last
            />
            <div className="pl-11 pt-1">
              <p className="text-[11px] text-gray-500">
                Edge: <code className="rounded bg-gray-100 px-1">instant-sell-crypto-v2</code> · RPC:{' '}
                <code className="rounded bg-gray-100 px-1">instant_sell_crypto_v2</code>
              </p>
              <p className="text-[11px] text-gray-500 mt-1">
                Custody sweeps to main addresses are documented post-trade; chain broadcast is not inside the instant
                sell RPC.
              </p>
            </div>
          </div>
        </div>
      </div>

      <div className="grid gap-4 lg:grid-cols-2 mb-6">
        <div className={`${SECTION} p-5`}>
          <h2 className="text-sm font-bold text-gray-900">Deposits and sends</h2>
          <ul className="mt-3 space-y-2 text-sm text-gray-600">
            <li className="flex gap-2">
              <span className="mt-1.5 h-1.5 w-1.5 shrink-0 rounded-full bg-emerald-500" />
              <span>
                <strong className="text-gray-800">Deposit credited</strong> increases user crypto and{' '}
                <code className="text-[11px]">*_pending_inventory</code> (custody aligned with credited coins).
              </span>
            </li>
            <li className="flex gap-2">
              <span className="mt-1.5 h-1.5 w-1.5 shrink-0 rounded-full bg-purple-500" />
              <span>
                <strong className="text-gray-800">Send / debit</strong> reduces user balances and lowers pending only
                (up to send size), not hot inventory, so instant-buy balances do not shrink the wrong bucket.
              </span>
            </li>
          </ul>
        </div>
        <div className={`${SECTION} p-5`}>
          <h2 className="text-sm font-bold text-gray-900">Swap</h2>
          <p className={`${P} mt-2`}>
            Internal swap debits the &quot;from&quot; asset and credits the &quot;to&quot; asset. Treasury uses the same{' '}
            <strong className="text-gray-800">pending-first</strong> rule on the from leg so deposit-backed coins do
            not inflate hot inventory twice.
          </p>
          <p className="text-[11px] text-gray-500 mt-3 font-mono">swap_crypto</p>
        </div>
      </div>

      <div className={`${SECTION} p-5 sm:p-6`}>
        <h2 className="text-sm font-bold text-gray-900">Where to work in this module</h2>
        <div className="mt-4 grid gap-3 sm:grid-cols-3">
          <Link
            href="/admin/wallet-management/crypto-assets"
            className="group rounded-xl border border-gray-200 bg-gray-50/60 p-4 transition hover:border-purple-300 hover:bg-purple-50/50"
          >
            <p className="text-xs font-bold text-gray-900 group-hover:text-purple-900">Crypto assets</p>
            <p className="mt-1 text-[11px] text-gray-600 leading-snug">
              Tickers, treasury totals (inv + pending), addresses, quotes, toggles.
            </p>
            <span className="mt-2 inline-block text-[11px] font-semibold text-purple-700">Open →</span>
          </Link>
          <Link
            href="/admin/wallet-management/crypto-rates"
            className="group rounded-xl border border-gray-200 bg-gray-50/60 p-4 transition hover:border-purple-300 hover:bg-purple-50/50"
          >
            <p className="text-xs font-bold text-gray-900 group-hover:text-purple-900">Crypto rates</p>
            <p className="mt-1 text-[11px] text-gray-600 leading-snug">Market vs list overrides used by retail flows.</p>
            <span className="mt-2 inline-block text-[11px] font-semibold text-purple-700">Open →</span>
          </Link>
          <Link
            href="/admin/wallet-management/deposit-management"
            className="group rounded-xl border border-gray-200 bg-gray-50/60 p-4 transition hover:border-purple-300 hover:bg-purple-50/50"
          >
            <p className="text-xs font-bold text-gray-900 group-hover:text-purple-900">Deposit management</p>
            <p className="mt-1 text-[11px] text-gray-600 leading-snug">Detector pipeline: incoming and delivered rows.</p>
            <span className="mt-2 inline-block text-[11px] font-semibold text-purple-700">Open →</span>
          </Link>
        </div>
      </div>

      <p className="mt-6 text-center text-[11px] text-gray-500">
        Documentation reflects current ledger design. For schema changes, apply Supabase migrations and redeploy edge
        functions that call updated RPCs.
      </p>
    </div>
  );
}
