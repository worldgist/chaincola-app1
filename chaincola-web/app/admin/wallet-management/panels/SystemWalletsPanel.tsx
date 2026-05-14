'use client';

import { useState, useEffect } from 'react';
import {
  createEmptySystemWalletAddressDraft,
  updateAdminSystemWalletAddresses,
  fetchAdminSystemWalletRow,
  fundAdminSystemWalletLedger,
  parseSystemDecimal,
  type FundableSystemAsset,
  type SystemWalletAddressColumn,
  type SystemWalletRow,
} from '@/lib/admin-system-wallet';

type Asset = 'BTC' | 'ETH' | 'USDT' | 'USDC' | 'XRP' | 'SOL';

const CRYPTO_ASSETS: Asset[] = ['BTC', 'ETH', 'USDT', 'USDC', 'XRP', 'SOL'];

const FUNDABLE_OPTIONS: FundableSystemAsset[] = ['BTC', 'ETH', 'USDT', 'USDC', 'XRP', 'SOL', 'NGN'];

const ALL_ADDRESS_KEYS: SystemWalletAddressColumn[] = [
  'btc_main_address',
  'eth_main_address',
  'sol_main_address',
  'xrp_main_address',
  'usdt_eth_main_address',
  'usdt_tron_main_address',
  'usdt_sol_main_address',
  'usdc_eth_main_address',
  'usdc_sol_main_address',
];

type AddressLine = { column: SystemWalletAddressColumn; label: string };

function addressLinesForAsset(asset: Asset): AddressLine[] {
  switch (asset) {
    case 'BTC':
      return [{ column: 'btc_main_address', label: 'Bitcoin (mainnet)' }];
    case 'ETH':
      return [{ column: 'eth_main_address', label: 'Ethereum (mainnet)' }];
    case 'SOL':
      return [{ column: 'sol_main_address', label: 'Solana (mainnet)' }];
    case 'XRP':
      return [{ column: 'xrp_main_address', label: 'XRP Ledger' }];
    case 'USDT':
      return [
        { column: 'usdt_eth_main_address', label: 'Ethereum (ERC-20)' },
        { column: 'usdt_tron_main_address', label: 'TRON (TRC-20)' },
        { column: 'usdt_sol_main_address', label: 'Solana (SPL)' },
      ];
    case 'USDC':
      return [
        { column: 'usdc_eth_main_address', label: 'Ethereum (ERC-20)' },
        { column: 'usdc_sol_main_address', label: 'Solana (SPL)' },
      ];
  }
}

function n(v: unknown): string {
  if (v == null) return '';
  const s = String(v);
  return s === 'null' || s === 'undefined' ? '' : s;
}

export default function SystemWalletsPanel() {
  const [savingWallets, setSavingWallets] = useState(false);
  const [loadingRow, setLoadingRow] = useState(true);
  const [funding, setFunding] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [fundBanner, setFundBanner] = useState<{ type: 'ok' | 'err'; text: string } | null>(null);
  const [saveSuccessModalOpen, setSaveSuccessModalOpen] = useState(false);
  const [row, setRow] = useState<SystemWalletRow>(() => createEmptySystemWalletAddressDraft());
  const [fundAsset, setFundAsset] = useState<FundableSystemAsset>('BTC');
  const [fundAmount, setFundAmount] = useState('');
  const [fundReason, setFundReason] = useState('');

  const inventoryField = (asset: Asset) => `${asset.toLowerCase()}_inventory` as const;

  const loadRow = async () => {
    setLoadingRow(true);
    setError(null);
    try {
      const res = await fetchAdminSystemWalletRow();
      if (!res.success || !res.data) {
        setError(res.error || 'Failed to load system wallet');
        return;
      }
      setRow(res.data);
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : 'Failed to load system wallet');
    } finally {
      setLoadingRow(false);
    }
  };

  useEffect(() => {
    void loadRow();
  }, []);

  const applyFundLedger = async () => {
    const raw = fundAmount.replace(/,/g, '').trim();
    const n = parseFloat(raw);
    if (!Number.isFinite(n) || n <= 0) {
      setFundBanner({ type: 'err', text: 'Enter a positive amount.' });
      return;
    }
    setFunding(true);
    setFundBanner(null);
    try {
      const res = await fundAdminSystemWalletLedger({
        asset: fundAsset,
        amount: n,
        reason: fundReason.trim() || undefined,
      });
      if (!res.success || !res.data) {
        setFundBanner({ type: 'err', text: res.error || 'Failed to credit ledger' });
        return;
      }
      setRow(res.data);
      setFundAmount('');
      setFundBanner({
        type: 'ok',
        text: `Credited ${fundAsset}. Book balances updated (instant buy pool for crypto; NGN float for instant sell payouts).`,
      });
    } catch (e: unknown) {
      setFundBanner({ type: 'err', text: e instanceof Error ? e.message : 'Failed to credit ledger' });
    } finally {
      setFunding(false);
    }
  };

  const formatCryptoLedger = (asset: Asset) => {
    const key = inventoryField(asset) as keyof SystemWalletRow;
    return parseSystemDecimal(row?.[key]).toFixed(8);
  };

  const formatNgnFloat = () =>
    parseSystemDecimal(row?.ngn_float_balance).toLocaleString('en-NG', {
      minimumFractionDigits: 2,
      maximumFractionDigits: 2,
    });

  const saveWalletAddresses = async () => {
    setSavingWallets(true);
    setError(null);
    setSaveSuccessModalOpen(false);
    try {
      const addresses: Partial<Record<SystemWalletAddressColumn, string | null>> = {};
      for (const k of ALL_ADDRESS_KEYS) {
        const v = row[k as keyof SystemWalletRow];
        const s = v == null ? '' : String(v).trim();
        if (s.length > 0) addresses[k] = s;
      }
      if (Object.keys(addresses).length === 0) {
        setError('Enter at least one treasury address to save. Empty fields are skipped so existing values in the database are not cleared by mistake.');
        return;
      }
      const res = await updateAdminSystemWalletAddresses(addresses);
      if (!res.success || !res.data) {
        setError(res.error || 'Failed to save wallet addresses');
        return;
      }
      setRow(res.data as SystemWalletRow);
      setSaveSuccessModalOpen(true);
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : 'Failed to save wallet addresses');
    } finally {
      setSavingWallets(false);
    }
  };

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="text-sm text-gray-600 max-w-3xl">
          <strong>system_wallets</strong> id=1 holds treasury <strong>book balances</strong> (hot crypto inventory for
          instant buy, NGN float for instant sell) and <strong>on-chain receive addresses</strong>. Use{' '}
          <strong>Reload</strong> to refresh from the database, <strong>Fund ledger</strong> below to credit inventory
          after real treasury movements, and <strong>Save changes</strong> for addresses only (non-empty fields are sent
          so existing stored addresses are not cleared by mistake).
        </div>
        <div className="flex flex-wrap gap-2 shrink-0">
          <button
            type="button"
            onClick={() => void loadRow()}
            disabled={loadingRow || savingWallets || funding}
            className={`px-4 py-2 rounded-lg text-sm font-medium border ${
              loadingRow || savingWallets || funding
                ? 'bg-gray-100 text-gray-400 border-gray-200 cursor-not-allowed'
                : 'bg-white text-gray-800 border-gray-300 hover:bg-gray-50'
            }`}
          >
            {loadingRow ? 'Loading…' : 'Reload'}
          </button>
          <button
            type="button"
            onClick={() => void saveWalletAddresses()}
            disabled={savingWallets || loadingRow}
            className={`px-4 py-2 rounded-lg text-sm font-medium border ${
              savingWallets || loadingRow
                ? 'bg-gray-100 text-gray-400 border-gray-200 cursor-not-allowed'
                : 'bg-purple-600 text-white border-purple-600 hover:bg-purple-700'
            }`}
          >
            {savingWallets ? 'Saving…' : 'Save changes'}
          </button>
        </div>
      </div>

      <div className="rounded-lg border border-purple-100 bg-purple-50/60 p-4 space-y-3">
        <h3 className="text-sm font-semibold text-gray-900">Fund system ledger</h3>
        <p className="text-xs text-gray-600">
          Credits are <strong>additive</strong> on the book: crypto increases hot <code className="text-xs">*_inventory</code>{' '}
          (instant buy pool); NGN increases <code className="text-xs">ngn_float_balance</code> (instant sell / payout
          float). This does not move on-chain funds — record why you are adjusting the ledger.
        </p>
        <div className="flex flex-wrap items-end gap-3">
          <div>
            <label className="block text-[11px] font-semibold text-gray-600 mb-1">Asset</label>
            <select
              value={fundAsset}
              disabled={funding || loadingRow}
              onChange={(e) => setFundAsset(e.target.value as FundableSystemAsset)}
              className="px-3 py-2 border border-gray-200 rounded-lg text-sm bg-white min-w-[7rem]"
            >
              {FUNDABLE_OPTIONS.map((a) => (
                <option key={a} value={a}>
                  {a}
                </option>
              ))}
            </select>
          </div>
          <div className="min-w-[8rem]">
            <label className="block text-[11px] font-semibold text-gray-600 mb-1">Amount</label>
            <input
              type="text"
              inputMode="decimal"
              disabled={funding || loadingRow}
              value={fundAmount}
              onChange={(e) => setFundAmount(e.target.value)}
              placeholder={fundAsset === 'NGN' ? 'e.g. 500000' : 'e.g. 0.25'}
              className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm bg-white"
              autoComplete="off"
            />
          </div>
          <div className="flex-1 min-w-[12rem] max-w-md">
            <label className="block text-[11px] font-semibold text-gray-600 mb-1">Reason (optional)</label>
            <input
              type="text"
              disabled={funding || loadingRow}
              value={fundReason}
              onChange={(e) => setFundReason(e.target.value)}
              placeholder="e.g. Treasury deposit tx … / manual reconciliation"
              className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm bg-white"
              autoComplete="off"
            />
          </div>
          <button
            type="button"
            onClick={() => void applyFundLedger()}
            disabled={funding || loadingRow}
            className={`px-4 py-2 rounded-lg text-sm font-medium border ${
              funding || loadingRow
                ? 'bg-gray-100 text-gray-400 border-gray-200 cursor-not-allowed'
                : 'bg-emerald-600 text-white border-emerald-600 hover:bg-emerald-700'
            }`}
          >
            {funding ? 'Applying…' : 'Fund ledger'}
          </button>
        </div>
      </div>

      {saveSuccessModalOpen && (
        <div
          className="fixed inset-0 z-[60] flex items-center justify-center p-4 bg-black/45"
          role="dialog"
          aria-modal="true"
          aria-labelledby="system-wallets-save-success-title"
        >
          <div className="bg-white rounded-xl shadow-xl max-w-md w-full p-6 border border-gray-200 text-center space-y-4">
            <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-full bg-emerald-100 text-emerald-700">
              <svg className="h-7 w-7" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2} aria-hidden>
                <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
              </svg>
            </div>
            <div>
              <h4 id="system-wallets-save-success-title" className="text-lg font-semibold text-gray-900">
                Changes saved
              </h4>
              <p className="mt-2 text-sm text-gray-600 leading-relaxed">
                The addresses you entered were written to{' '}
                <code className="rounded bg-gray-100 px-1 py-0.5 text-xs">system_wallets</code> (id=1). Other address
                columns were left unchanged.
              </p>
            </div>
            <button
              type="button"
              className="w-full sm:w-auto min-w-[120px] px-4 py-2.5 rounded-lg text-sm font-medium bg-purple-700 text-white hover:bg-purple-800"
              onClick={() => setSaveSuccessModalOpen(false)}
            >
              OK
            </button>
          </div>
        </div>
      )}

      {error && (
        <div className="rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">{error}</div>
      )}

      {fundBanner && (
        <div
          className={`rounded-lg border px-4 py-3 text-sm ${
            fundBanner.type === 'ok'
              ? 'border-emerald-200 bg-emerald-50 text-emerald-900'
              : 'border-red-200 bg-red-50 text-red-700'
          }`}
        >
          {fundBanner.text}
        </div>
      )}

      <div className="rounded-lg border border-gray-100 overflow-x-auto bg-white">
        <table className="min-w-full text-sm">
          <thead className="bg-gray-50 text-gray-600 text-left">
            <tr>
              <th className="px-4 py-3 font-medium w-28">Asset</th>
              <th className="px-4 py-3 font-medium w-44">Hot ledger (read-only)</th>
              <th className="px-4 py-3 font-medium">Treasury receive address by network</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-100">
            {CRYPTO_ASSETS.map((asset) => {
              const lines = addressLinesForAsset(asset);
              return (
                <tr key={asset}>
                  <td className="px-4 py-3 font-semibold text-gray-900 align-top">{asset}</td>
                  <td className="px-4 py-3 align-top">
                    <input
                      readOnly
                      title="Credit via Fund system ledger"
                      value={loadingRow ? '…' : formatCryptoLedger(asset)}
                      className="w-full max-w-[11rem] px-3 py-2 border rounded-lg text-sm outline-none bg-gray-50 text-gray-700 border-gray-200 cursor-default font-mono"
                    />
                  </td>
                  <td className="px-4 py-3">
                    <div className="flex flex-col gap-3">
                      {lines.map((line) => (
                        <div key={line.column}>
                          <label className="block text-[11px] font-semibold text-gray-600 mb-1">{line.label}</label>
                          <input
                            disabled={savingWallets || loadingRow}
                            value={n(row?.[line.column as keyof SystemWalletRow])}
                            onChange={(e) =>
                              setRow((prev) => ({
                                ...prev,
                                [line.column]: e.target.value,
                              }))
                            }
                            className={`w-full max-w-[36rem] px-3 py-2 border rounded-lg text-sm outline-none font-mono ${
                              savingWallets || loadingRow
                                ? 'bg-gray-50 text-gray-400 border-gray-200'
                                : 'bg-white border-gray-200'
                            }`}
                            placeholder={`Treasury ${asset} address (${line.label})`}
                            spellCheck={false}
                            autoComplete="off"
                          />
                        </div>
                      ))}
                    </div>
                  </td>
                </tr>
              );
            })}
            <tr key="NGN">
              <td className="px-4 py-3 font-semibold text-gray-900 align-top">NGN</td>
              <td className="px-4 py-3 align-top">
                <input
                  readOnly
                  title="Credit via Fund system ledger"
                  value={loadingRow ? '…' : `₦${formatNgnFloat()}`}
                  className="w-full max-w-[11rem] px-3 py-2 border rounded-lg text-sm outline-none bg-gray-50 text-gray-700 border-gray-200 cursor-default"
                />
              </td>
              <td className="px-4 py-3 text-xs text-gray-600 align-top leading-relaxed">
                NGN float backs instant sells and similar payouts. Top up in the bank / treasury first, then credit the
                ledger here so the app can honor user cash-outs.
              </td>
            </tr>
          </tbody>
        </table>
      </div>

      <p className="text-xs text-gray-500">
        Address saves use the admin edge function with your session. To replace an existing address, paste the new value
        and save; leave a field blank to leave the stored value unchanged for that column. Ledger credits are audited in{' '}
        <code className="rounded bg-gray-100 px-1 py-0.5 text-[10px]">admin_action_logs</code> as{' '}
        <code className="rounded bg-gray-100 px-1 py-0.5 text-[10px]">system_wallet_fund</code>.
      </p>
    </div>
  );
}
