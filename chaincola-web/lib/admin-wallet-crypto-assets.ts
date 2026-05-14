/**
 * Crypto assets surfaced in Admin → Wallet management.
 * Intentionally excludes other DB currencies (e.g. TRX) from this console.
 */
export const ADMIN_WALLET_CRYPTO_ASSETS = [
  { symbol: 'BTC' as const, name: 'Bitcoin', logo: '/images/bitcoin.png' },
  { symbol: 'ETH' as const, name: 'Ethereum', logo: '/images/ethereum.png' },
  { symbol: 'USDT' as const, name: 'Tether', logo: '/images/tether.png' },
  { symbol: 'USDC' as const, name: 'USD Coin', logo: '/images/usdc.png' },
  { symbol: 'XRP' as const, name: 'Ripple', logo: '/images/ripple.png' },
  { symbol: 'SOL' as const, name: 'Solana', logo: '/images/solana.svg' },
] as const;

export type AdminWalletCryptoSymbol = (typeof ADMIN_WALLET_CRYPTO_ASSETS)[number]['symbol'];

export const ADMIN_WALLET_CRYPTO_SYMBOLS: readonly AdminWalletCryptoSymbol[] =
  ADMIN_WALLET_CRYPTO_ASSETS.map((a) => a.symbol);
