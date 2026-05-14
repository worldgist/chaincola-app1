/**
 * Shared utility functions for auto-sweep engine
 * 
 * Auto-sweep moves funds from user deposit addresses to central hot wallets
 * for security and centralized management.
 */

import { SupabaseClient } from "https://esm.sh/@supabase/supabase-js@2";
import { getTatumApiKey, tatumBtcAddressBalanceBtc } from "./tatum-bitcoin.ts";

export interface SweepResult {
  success: boolean;
  cryptoCurrency: string;
  amountSwept: number;
  transactionHash?: string;
  centralWalletAddress: string;
  error?: string;
}

export interface CentralWalletConfig {
  BTC?: string;
  ETH?: string;
  SOL?: string;
  XRP?: string;
  USDT?: string;
  USDC?: string;
}

/**
 * Get central wallet addresses from environment variables
 */
export function getCentralWalletAddresses(): CentralWalletConfig {
  return {
    BTC: Deno.env.get('CENTRAL_BTC_WALLET') || Deno.env.get('HOT_WALLET_BTC'),
    ETH: Deno.env.get('CENTRAL_ETH_WALLET') || Deno.env.get('HOT_WALLET_ETH'),
    SOL: Deno.env.get('CENTRAL_SOL_WALLET') || Deno.env.get('HOT_WALLET_SOL'),
    XRP: Deno.env.get('CENTRAL_XRP_WALLET') || Deno.env.get('HOT_WALLET_XRP'),
    USDT: Deno.env.get('CENTRAL_USDT_WALLET') || Deno.env.get('CENTRAL_ETH_WALLET') || Deno.env.get('HOT_WALLET_ETH'),
    USDC: Deno.env.get('CENTRAL_USDC_WALLET') || Deno.env.get('CENTRAL_ETH_WALLET') || Deno.env.get('HOT_WALLET_ETH'),
  };
}

/**
 * Get central wallet address for a specific cryptocurrency
 */
export function getCentralWalletAddress(cryptoCurrency: string): string | null {
  const addresses = getCentralWalletAddresses();
  const currency = cryptoCurrency.toUpperCase();
  
  if (currency === 'USDT' || currency === 'USDC') {
    return addresses.ETH || null;
  }
  
  return addresses[currency as keyof CentralWalletConfig] || null;
}

/**
 * Check if a deposit transaction has already been swept
 */
export async function isDepositSwept(
  supabase: SupabaseClient,
  depositTransactionId: string
): Promise<boolean> {
  const { data: transaction } = await supabase
    .from('transactions')
    .select('metadata')
    .eq('id', depositTransactionId)
    .single();
  
  if (!transaction || !transaction.metadata) {
    return false;
  }
  
  return transaction.metadata.swept === true || transaction.metadata.swept_at !== undefined;
}

/**
 * Mark a deposit transaction as swept
 */
export async function markDepositAsSwept(
  supabase: SupabaseClient,
  depositTransactionId: string,
  sweepTransactionHash: string,
  sweepAmount: number
): Promise<void> {
  const { data: transaction } = await supabase
    .from('transactions')
    .select('metadata')
    .eq('id', depositTransactionId)
    .single();
  
  if (!transaction) {
    throw new Error('Deposit transaction not found');
  }
  
  const metadata = transaction.metadata || {};
  
  await supabase
    .from('transactions')
    .update({
      metadata: {
        ...metadata,
        swept: true,
        swept_at: new Date().toISOString(),
        sweep_transaction_hash: sweepTransactionHash,
        sweep_amount: sweepAmount,
      },
    })
    .eq('id', depositTransactionId);
}

/**
 * Get on-chain balance for a wallet address
 */
export async function getOnChainBalance(
  cryptoCurrency: string,
  address: string
): Promise<number> {
  const currency = cryptoCurrency.toUpperCase();
  
  try {
    if (currency === 'BTC') {
      return await getBitcoinBalance(address);
    } else if (currency === 'ETH') {
      return await getEthereumBalance(address);
    } else if (currency === 'SOL') {
      return await getSolanaBalance(address);
    } else if (currency === 'XRP') {
      return await getXrpBalance(address);
    } else if (currency === 'USDT' || currency === 'USDC') {
      return await getErc20Balance(address, currency);
    }
    
    return 0;
  } catch (error) {
    console.error(`Error getting ${currency} balance for ${address}:`, error);
    return 0;
  }
}

async function getBitcoinBalance(address: string): Promise<number> {
  if (!getTatumApiKey()) {
    console.warn("getBitcoinBalance: TATUM_API_KEY missing; returning 0");
    return 0;
  }
  return tatumBtcAddressBalanceBtc(address);
}

async function getEthereumBalance(address: string): Promise<number> {
  const alchemyUrl = Deno.env.get('ALCHEMY_ETHEREUM_URL') || 'https://eth-mainnet.g.alchemy.com/v2/3L_iw-7-b25_bzLHmLyUJ';
  
  const response = await fetch(alchemyUrl, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      jsonrpc: '2.0',
      method: 'eth_getBalance',
      params: [address.toLowerCase(), 'latest'],
      id: 1,
    }),
  });
  
  if (!response.ok) {
    throw new Error(`Ethereum API error: ${response.status}`);
  }
  
  const data = await response.json();
  const balanceWei = BigInt(data.result || '0');
  return Number(balanceWei) / 1e18;
}

async function getSolanaBalance(address: string): Promise<number> {
  const alchemyUrl = Deno.env.get('ALCHEMY_SOLANA_URL') || 'https://solana-mainnet.g.alchemy.com/v2/3L_iw-7-b25_bzLHmLyUJ';
  
  const response = await fetch(alchemyUrl, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      jsonrpc: '2.0',
      method: 'getBalance',
      params: [address],
      id: 1,
    }),
  });
  
  if (!response.ok) {
    throw new Error(`Solana API error: ${response.status}`);
  }
  
  const data = await response.json();
  const balanceLamports = data.result?.value || 0;
  return balanceLamports / 1e9;
}

async function getXrpBalance(address: string): Promise<number> {
  const xrpApiUrl = 'https://xrplcluster.com';
  
  const response = await fetch(xrpApiUrl, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      method: 'account_info',
      params: [{
        account: address,
        ledger_index: 'validated',
      }],
    }),
  });
  
  if (!response.ok) {
    throw new Error(`XRP API error: ${response.status}`);
  }
  
  const data = await response.json();
  const balanceDrops = data.result?.account_data?.Balance || '0';
  return parseFloat(balanceDrops) / 1e6;
}

async function getErc20Balance(address: string, token: string): Promise<number> {
  const tokenContracts: Record<string, string> = {
    USDT: '0xdAC17F958D2ee523a2206206994597C13D831ec7',
    USDC: '0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48',
  };
  
  const contractAddress = tokenContracts[token];
  if (!contractAddress) {
    return 0;
  }
  
  const alchemyUrl = Deno.env.get('ALCHEMY_ETHEREUM_URL') || 'https://eth-mainnet.g.alchemy.com/v2/3L_iw-7-b25_bzLHmLyUJ';
  
  const functionSignature = '0x70a08231';
  const paddedAddress = address.toLowerCase().slice(2).padStart(64, '0');
  const data = functionSignature + paddedAddress;
  
  const response = await fetch(alchemyUrl, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      jsonrpc: '2.0',
      method: 'eth_call',
      params: [{
        to: contractAddress.toLowerCase(),
        data: data,
      }, 'latest'],
      id: 1,
    }),
  });
  
  if (!response.ok) {
    throw new Error(`ERC-20 API error: ${response.status}`);
  }
  
  const result = await response.json();
  const balanceHex = result.result || '0x0';
  const balanceWei = BigInt(balanceHex);
  
  return Number(balanceWei) / 1e6;
}
