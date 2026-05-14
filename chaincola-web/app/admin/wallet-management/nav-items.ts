export type WalletNavGroup = 'wallet' | 'operations';

export type WalletNavItem = {
  href: string;
  label: string;
  description: string;
  group: WalletNavGroup;
};

export const WALLET_NAV_ITEMS: WalletNavItem[] = [
  {
    group: 'wallet',
    href: '/admin/wallet-management/overview',
    label: 'Treasury hub',
    description:
      'Dashboard: KPIs, treasury snapshot, crypto book table, and quick links — same data as Crypto assets.',
  },
  {
    group: 'wallet',
    href: '/admin/wallet-management/crypto-assets',
    label: 'Crypto assets',
    description:
      'Six tickers: user balances, treasury addresses you save here or on System wallets, market quotes, list overrides, and runtime flags.',
  },
  {
    group: 'wallet',
    href: '/admin/wallet-management/system-wallets',
    label: 'System wallets',
    description:
      'Treasury receive addresses on system_wallets id=1: per-network fields for USDT (ERC-20, TRC-20, Solana SPL) and USDC (ERC-20, Solana SPL). Save sends only filled fields.',
  },
  {
    group: 'wallet',
    href: '/admin/wallet-management/crypto-rates',
    label: 'Crypto rates',
    description:
      'Market NGN buy/sell from Luno/Alchemy (read-only) and editable list rates stored in app settings (overrides).',
  },
  {
    group: 'wallet',
    href: '/admin/wallet-management/treasury-ngn-ledger',
    label: 'Treasury NGN ledger',
    description:
      'Bucket balances (payout reserve, fee revenue, operating float), append-only journal, and admin moves between buckets.',
  },
  {
    group: 'wallet',
    href: '/admin/wallet-management/deposit-management',
    label: 'Deposit management',
    description:
      'On-chain crypto deposits (RECEIVE): monitor incoming, delivered, and failed detector rows with search and filters.',
  },
  {
    group: 'operations',
    href: '/admin/wallet-management/treasury-guide',
    label: 'Treasury guide',
    description: 'How hot inventory, pending inventory, NGN float, instant buy/sell, and swaps behave on the ledger.',
  },
];
