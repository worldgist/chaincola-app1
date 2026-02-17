/**
 * Demo Wallet Addresses
 * Pre-configured wallet addresses for testing send/receive crypto functionality
 * These are real wallet addresses that can be used for demo purposes
 */

export interface DemoWallet {
  symbol: string;
  name: string;
  address: string;
  network: 'mainnet' | 'testnet';
  description: string;
}

/**
 * Demo wallet addresses for testing
 * These addresses can be used for:
 * - Testing send crypto functionality
 * - Testing receive crypto functionality
 * - Demo purposes
 */
export const DEMO_WALLETS: DemoWallet[] = [
  {
    symbol: 'BTC',
    name: 'Bitcoin',
    address: 'bc1qxy2kgdygjrsqtzq2n0yrf2493p83kkfjhx0wlh',
    network: 'mainnet',
    description: 'Demo Bitcoin wallet address for testing',
  },
  {
    symbol: 'ETH',
    name: 'Ethereum',
    address: '0x742d35Cc6634C0532925a3b844Bc9e7595f0bEb5',
    network: 'mainnet',
    description: 'Demo Ethereum wallet address for testing',
  },
  {
    symbol: 'USDT',
    name: 'Tether',
    address: '0x742d35Cc6634C0532925a3b844Bc9e7595f0bEb5', // Same as ETH (ERC-20)
    network: 'mainnet',
    description: 'Demo USDT wallet address (ERC-20, same as ETH address)',
  },
  {
    symbol: 'USDC',
    name: 'USD Coin',
    address: '0x742d35Cc6634C0532925a3b844Bc9e7595f0bEb5', // Same as ETH (ERC-20)
    network: 'mainnet',
    description: 'Demo USDC wallet address (ERC-20, same as ETH address)',
  },
  {
    symbol: 'SOL',
    name: 'Solana',
    address: '7xKXtg2CW87d97TXJSDpbD5jBkheTqA83TZRuJosgAsU',
    network: 'mainnet',
    description: 'Demo Solana wallet address for testing',
  },
  {
    symbol: 'XRP',
    name: 'Ripple',
    address: 'rN7n7otQDd6FczFgLdSqtcsAUxDkw6fzRH',
    network: 'mainnet',
    description: 'Demo XRP wallet address for testing',
  },
];

/**
 * Get demo wallet address for a specific cryptocurrency
 */
export function getDemoWallet(symbol: string): DemoWallet | null {
  const wallet = DEMO_WALLETS.find(w => w.symbol.toUpperCase() === symbol.toUpperCase());
  return wallet || null;
}

/**
 * Get all demo wallet addresses
 */
export function getAllDemoWallets(): DemoWallet[] {
  return DEMO_WALLETS;
}

/**
 * Check if an address is a demo wallet address
 */
export function isDemoWallet(address: string): boolean {
  return DEMO_WALLETS.some(wallet => 
    wallet.address.toLowerCase() === address.toLowerCase()
  );
}

/**
 * Get demo wallet info by address
 */
export function getDemoWalletByAddress(address: string): DemoWallet | null {
  const wallet = DEMO_WALLETS.find(w => 
    w.address.toLowerCase() === address.toLowerCase()
  );
  return wallet || null;
}
