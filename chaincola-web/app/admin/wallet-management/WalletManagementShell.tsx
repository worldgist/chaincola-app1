'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useMemo, useState } from 'react';
import { WALLET_NAV_ITEMS, type WalletNavGroup } from './nav-items';

const GROUP_LABEL: Record<WalletNavGroup, string> = {
  wallet: 'Wallet management',
  operations: 'Operations',
};

export default function WalletManagementShell({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  /** Sub-pages rail is off-canvas until the header menu button opens it (all breakpoints). */
  const [sidebarOpen, setSidebarOpen] = useState(false);

  const current = useMemo(
    () => WALLET_NAV_ITEMS.find((item) => item.href === pathname) ?? WALLET_NAV_ITEMS[0],
    [pathname],
  );

  const isHub = pathname === '/admin/wallet-management/overview';
  const isTreasuryGuide = pathname.includes('/treasury-guide');
  const showLiveDataStrip =
    !isHub &&
    !isTreasuryGuide &&
    !pathname.includes('/treasury-ngn-ledger') &&
    (pathname.includes('/crypto-assets') ||
      pathname.includes('/crypto-rates') ||
      pathname.includes('/deposit-management'));

  const grouped = useMemo(() => {
    const out: Record<WalletNavGroup, typeof WALLET_NAV_ITEMS> = { wallet: [], operations: [] };
    for (const item of WALLET_NAV_ITEMS) {
      out[item.group].push(item);
    }
    return out;
  }, []);

  return (
    <div className="min-h-[100dvh] flex bg-gray-100 text-[13px] leading-snug text-gray-800">
      {sidebarOpen ? (
        <button
          type="button"
          className="fixed inset-0 z-40 bg-black/50"
          aria-label="Close menu"
          onClick={() => setSidebarOpen(false)}
        />
      ) : null}

      <aside
        className={`fixed inset-y-0 left-0 z-50 w-[17.5rem] shrink-0 flex flex-col bg-purple-700 text-white border-r-2 border-purple-900/40 shadow-xl shadow-purple-900/25 transform transition-transform duration-200 ease-out ${
          sidebarOpen ? 'translate-x-0' : '-translate-x-full pointer-events-none'
        }`}
        aria-hidden={!sidebarOpen}
      >
        <div className="px-4 pt-5 pb-4 border-b border-white/20">
          <div className="text-xl font-bold tracking-tight text-white leading-none">ChainCola</div>
          <div className="text-xs font-semibold uppercase tracking-[0.2em] text-white/80 mt-2">Admin</div>
        </div>

        <div className="px-3 py-3 border-b border-white/20">
          <Link
            href="/admin/dashboard"
            className="flex items-center justify-center gap-2 w-full rounded-xl border-2 border-white/90 bg-white px-3 py-3 text-sm font-bold text-purple-700 shadow-md hover:bg-purple-50 hover:border-white transition-colors"
            onClick={() => setSidebarOpen(false)}
          >
            <span aria-hidden className="text-lg leading-none">
              ←
            </span>
            <span>Back to dashboard</span>
          </Link>
        </div>

        <nav className="flex-1 overflow-y-auto px-3 py-4 space-y-8" aria-label="Wallet management">
          {(Object.keys(grouped) as WalletNavGroup[]).map((group) => (
            <div key={group}>
              <div className="text-[11px] font-bold uppercase tracking-widest text-white/75 px-2 mb-3 border-l-4 border-white/40 pl-2">
                {GROUP_LABEL[group]}
              </div>
              <ul className="space-y-1">
                {grouped[group].map((item) => {
                  const active = pathname === item.href;
                  return (
                    <li key={item.href}>
                      <Link
                        href={item.href}
                        title={item.description}
                        onClick={() => setSidebarOpen(false)}
                        className={`block rounded-xl px-3 py-3 text-[15px] font-semibold leading-snug transition-colors ${
                          active
                            ? 'bg-white text-purple-700 shadow-md ring-2 ring-white/80'
                            : 'text-white hover:bg-white/15 hover:ring-1 hover:ring-white/30'
                        }`}
                        aria-current={active ? 'page' : undefined}
                      >
                        {item.label}
                      </Link>
                    </li>
                  );
                })}
              </ul>
            </div>
          ))}
        </nav>
      </aside>

      <div className="flex-1 flex flex-col min-w-0 min-h-0 w-full">
        <header className="shrink-0 flex items-center gap-3 px-4 py-3 border-b border-gray-200 bg-white shadow-sm">
          <button
            type="button"
            className="rounded-lg border border-gray-200 p-2 text-gray-700 hover:bg-gray-50"
            onClick={() => setSidebarOpen((o) => !o)}
            aria-label={sidebarOpen ? 'Close menu' : 'Open menu'}
            aria-expanded={sidebarOpen}
          >
            <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M4 6h16M4 12h16M4 18h16" />
            </svg>
          </button>
          <span className="text-sm font-semibold text-gray-900 truncate">Wallet management</span>
        </header>

        <main className="flex-1 min-h-0 overflow-y-auto">
          <div className="max-w-[1600px] mx-auto px-4 sm:px-6 py-4 lg:py-6 flex flex-col gap-4 min-h-full">
            {!isHub && (
              <div className="shrink-0">
                <nav className="text-[11px] text-gray-500 mb-1" aria-label="Breadcrumb">
                  <Link href="/admin/wallet-management/overview" className="hover:text-purple-700">
                    Treasury hub
                  </Link>
                  <span className="mx-1.5">/</span>
                  <span className="font-medium text-gray-800">{current.label}</span>
                </nav>
                <h1 className="text-lg sm:text-xl font-bold text-gray-900 tracking-tight border-l-4 border-purple-500 pl-2.5">
                  {current.label}
                </h1>
                <p className="text-[11px] text-gray-600 mt-1 max-w-3xl leading-snug">{current.description}</p>
              </div>
            )}

            {showLiveDataStrip && (
              <div className="shrink-0 rounded-xl border border-purple-100 bg-gradient-to-r from-purple-50/90 to-white px-3.5 py-2.5 text-[11px] text-gray-700 shadow-sm">
                <span className="font-semibold text-purple-900">Live data mix:</span>{' '}
                Crypto assets and rates use external feeds where configured; always reconcile with{' '}
                <code className="rounded bg-white/80 border border-purple-100/80 px-1 py-0.5 text-[10px]">
                  system_wallets
                </code>{' '}
                and on-chain explorers for custody.
              </div>
            )}

            <div className="flex-1 min-h-0 flex flex-col">{children}</div>
          </div>
        </main>
      </div>
    </div>
  );
}
