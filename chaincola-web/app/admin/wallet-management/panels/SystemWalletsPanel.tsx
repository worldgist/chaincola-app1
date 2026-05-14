'use client';

import { useState } from 'react';
import {
  createEmptySystemWalletAddressDraft,
  updateAdminSystemWalletAddresses,
  type SystemWalletAddressColumn,
  type SystemWalletRow,
} from '@/lib/admin-system-wallet';

type Asset = 'BTC' | 'ETH' | 'USDT' | 'USDC' | 'XRP' | 'SOL';

const ASSETS: Asset[] = ['BTC', 'ETH', 'USDT', 'USDC', 'XRP', 'SOL'];

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
  const [error, setError] = useState<string | null>(null);
  const [saveSuccessModalOpen, setSaveSuccessModalOpen] = useState(false);
  const [row, setRow] = useState<SystemWalletRow>(() => createEmptySystemWalletAddressDraft());

  const inventoryField = (asset: Asset) => `${asset.toLowerCase()}_inventory` as const;

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
        <div className="text-sm text-gray-600">
          <strong>system_wallets</strong> id=1: enter treasury <strong>on-chain receive addresses</strong> by network
          below, then <strong>Save changes</strong>. Only <strong>non-empty</strong> fields are sent so other addresses
          already in the database are preserved. USDT supports Ethereum (ERC-20), TRON (TRC-20), and Solana (SPL).
          USDC supports Ethereum (ERC-20) and Solana (SPL) only. Inventory is not updated from this page.
        </div>
        <div className="flex gap-2 shrink-0">
          <button
            type="button"
            onClick={() => void saveWalletAddresses()}
            disabled={savingWallets}
            className={`px-4 py-2 rounded-lg text-sm font-medium border ${
              savingWallets
                ? 'bg-gray-100 text-gray-400 border-gray-200 cursor-not-allowed'
                : 'bg-purple-600 text-white border-purple-600 hover:bg-purple-700'
            }`}
          >
            {savingWallets ? 'Saving…' : 'Save changes'}
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

      <div className="rounded-lg border border-gray-100 overflow-x-auto bg-white">
        <table className="min-w-full text-sm">
          <thead className="bg-gray-50 text-gray-600 text-left">
            <tr>
              <th className="px-4 py-3 font-medium w-28">Asset</th>
              <th className="px-4 py-3 font-medium w-40">Inventory (book)</th>
              <th className="px-4 py-3 font-medium">Treasury receive address by network</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-100">
            {ASSETS.map((asset) => {
              const invKey = inventoryField(asset) as keyof SystemWalletRow;
              const lines = addressLinesForAsset(asset);
              return (
                <tr key={asset}>
                  <td className="px-4 py-3 font-semibold text-gray-900 align-top">{asset}</td>
                  <td className="px-4 py-3 align-top">
                    <input
                      disabled
                      title="Inventory is not saved from this page"
                      value={n(row?.[invKey])}
                      className="w-full max-w-[10rem] px-3 py-2 border rounded-lg text-sm outline-none bg-gray-50 text-gray-600 border-gray-200 cursor-not-allowed"
                      placeholder="0"
                    />
                  </td>
                  <td className="px-4 py-3">
                    <div className="flex flex-col gap-3">
                      {lines.map((line) => (
                        <div key={line.column}>
                          <label className="block text-[11px] font-semibold text-gray-600 mb-1">{line.label}</label>
                          <input
                            disabled={savingWallets}
                            value={n(row?.[line.column as keyof SystemWalletRow])}
                            onChange={(e) =>
                              setRow((prev) => ({
                                ...prev,
                                [line.column]: e.target.value,
                              }))
                            }
                            className={`w-full max-w-[36rem] px-3 py-2 border rounded-lg text-sm outline-none font-mono ${
                              savingWallets ? 'bg-gray-50 text-gray-400 border-gray-200' : 'bg-white border-gray-200'
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
          </tbody>
        </table>
      </div>

      <p className="text-xs text-gray-500">
        Saves use the admin edge function with your session. To replace an existing address, paste the new value and
        save; leave a field blank to leave the stored value unchanged for that column.
      </p>
    </div>
  );
}
