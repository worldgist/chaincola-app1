import { createClient } from '@/lib/supabase/client';
import type { Database } from '@/lib/supabase/database.types';

export type SystemWalletRow = Database['public']['Tables']['system_wallets']['Row'];

/**
 * Local form defaults for treasury addresses (no GET). Admin fills fields, then Save posts `update_addresses` only.
 */
export function createEmptySystemWalletAddressDraft(): SystemWalletRow {
  const z = 0;
  return {
    id: 1,
    created_at: '',
    updated_at: '',
    btc_inventory: z,
    btc_pending_inventory: z,
    btc_main_address: null,
    eth_inventory: z,
    eth_pending_inventory: z,
    eth_main_address: null,
    ngn_float_balance: z,
    ngn_pending_float: z,
    sol_inventory: z,
    sol_pending_inventory: z,
    sol_main_address: null,
    usdc_eth_main_address: null,
    usdc_inventory: z,
    usdc_pending_inventory: z,
    usdc_sol_main_address: null,
    usdt_eth_main_address: null,
    usdt_inventory: z,
    usdt_pending_inventory: z,
    usdt_sol_main_address: null,
    usdt_tron_main_address: null,
    xrp_inventory: z,
    xrp_pending_inventory: z,
    xrp_main_address: null,
  };
}

export type SystemWalletAddressColumn =
  | 'btc_main_address'
  | 'eth_main_address'
  | 'sol_main_address'
  | 'xrp_main_address'
  | 'usdt_eth_main_address'
  | 'usdt_tron_main_address'
  | 'usdt_sol_main_address'
  | 'usdc_eth_main_address'
  | 'usdc_sol_main_address';

/**
 * Updates treasury main receive addresses on `system_wallets` id=1 (admin JWT + Edge service role).
 */
export async function updateAdminSystemWalletAddresses(
  addresses: Partial<Record<SystemWalletAddressColumn, string | null>>,
): Promise<{
  success: boolean;
  data?: SystemWalletRow;
  error?: string;
}> {
  try {
    const supabase = createClient();
    let {
      data: { session },
      error: sessionError,
    } = await supabase.auth.getSession();
    if (!session?.access_token) {
      const refreshed = await supabase.auth.refreshSession();
      session = refreshed.data.session ?? session;
    }
    if (!session?.access_token) {
      return { success: false, error: sessionError?.message || 'Not authenticated' };
    }
    const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || '';
    if (!supabaseUrl) {
      return { success: false, error: 'Supabase URL not configured' };
    }
    const res = await fetch(`${supabaseUrl}/functions/v1/admin-system-wallets`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${session.access_token}`,
        apikey: process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || '',
      },
      body: JSON.stringify({ action: 'update_addresses', addresses }),
    });
    const json = (await res.json().catch(() => ({}))) as {
      success?: boolean;
      data?: SystemWalletRow;
      error?: string;
    };
    if (!res.ok || !json.success) {
      return {
        success: false,
        error: json.error || `HTTP ${res.status}`,
      };
    }
    return { success: true, data: json.data };
  } catch (e) {
    return { success: false, error: (e as Error)?.message || 'Failed to update addresses' };
  }
}

/** Main receive / treasury on-chain address(es) per app ticker. */
export function formatSystemWalletAddressLines(
  sw: SystemWalletRow | null | undefined,
  symbol: string,
): { primary: string; secondary?: string } {
  if (!sw) return { primary: '' };
  const sym = symbol.toUpperCase();
  switch (sym) {
    case 'BTC':
      return { primary: (sw.btc_main_address ?? '').trim() };
    case 'ETH':
      return { primary: (sw.eth_main_address ?? '').trim() };
    case 'SOL':
      return { primary: (sw.sol_main_address ?? '').trim() };
    case 'XRP':
      return { primary: (sw.xrp_main_address ?? '').trim() };
    case 'USDT': {
      const eth = (sw.usdt_eth_main_address ?? '').trim();
      const tron = (sw.usdt_tron_main_address ?? '').trim();
      const sol = (sw.usdt_sol_main_address ?? '').trim();
      const lines = [
        eth ? `Ethereum (ERC-20): ${eth}` : '',
        tron ? `TRON (TRC-20): ${tron}` : '',
        sol ? `Solana (SPL): ${sol}` : '',
      ].filter(Boolean);
      const primary = lines[0] || '';
      const secondary = lines.length > 1 ? lines.slice(1).join('\n') : undefined;
      return { primary, secondary };
    }
    case 'USDC': {
      const eth = (sw.usdc_eth_main_address ?? '').trim();
      const sol = (sw.usdc_sol_main_address ?? '').trim();
      const lines = [
        eth ? `Ethereum (ERC-20): ${eth}` : '',
        sol ? `Solana (SPL): ${sol}` : '',
      ].filter(Boolean);
      const primary = lines[0] || '';
      const secondary = lines.length > 1 ? lines.slice(1).join('\n') : undefined;
      return { primary, secondary };
    }
    default:
      return { primary: '' };
  }
}

/** Parses DECIMAL / JSON numeric fields from PostgREST or Edge (number or string). */
export function parseSystemDecimal(v: unknown): number {
  if (typeof v === 'number' && Number.isFinite(v)) return v;
  if (typeof v === 'string') {
    const t = v.trim().replace(/,/g, '');
    if (!t) return 0;
    const n = parseFloat(t);
    return Number.isFinite(n) ? n : 0;
  }
  return 0;
}

/**
 * Full system NGN ledger on `system_wallets` id=1: settled float plus pending (unconfirmed) NGN.
 * They are separate buckets; instant-sell checks typically use settled float only.
 */
export function systemTreasuryNgnLedger(sw: SystemWalletRow | null | undefined): {
  settledFloat: number;
  pendingFloat: number;
  totalLedger: number;
} {
  if (!sw) return { settledFloat: 0, pendingFloat: 0, totalLedger: 0 };
  const settledFloat = parseSystemDecimal(sw.ngn_float_balance);
  const pendingFloat = parseSystemDecimal(sw.ngn_pending_float);
  return {
    settledFloat,
    pendingFloat,
    totalLedger: settledFloat + pendingFloat,
  };
}

function pickNum(n: unknown): number {
  const v = typeof n === 'number' ? n : parseFloat(String(n ?? '0'));
  return Number.isFinite(v) ? v : 0;
}

/** Hot-pool inventory only (used for instant buy checks in DB). */
export function systemInventoryAmount(sw: SystemWalletRow | null | undefined, symbol: string): number {
  if (!sw) return 0;
  const sym = symbol.toUpperCase();
  switch (sym) {
    case 'BTC':
      return pickNum(sw.btc_inventory);
    case 'ETH':
      return pickNum(sw.eth_inventory);
    case 'SOL':
      return pickNum(sw.sol_inventory);
    case 'XRP':
      return pickNum(sw.xrp_inventory);
    case 'USDT':
      return pickNum(sw.usdt_inventory);
    case 'USDC':
      return pickNum(sw.usdc_inventory);
    default:
      return 0;
  }
}

/** On-chain / uncredited-to-hot-pool bucket (deposit credits). */
export function systemPendingInventoryAmount(sw: SystemWalletRow | null | undefined, symbol: string): number {
  if (!sw) return 0;
  const sym = symbol.toUpperCase();
  switch (sym) {
    case 'BTC':
      return pickNum(sw.btc_pending_inventory);
    case 'ETH':
      return pickNum(sw.eth_pending_inventory);
    case 'SOL':
      return pickNum(sw.sol_pending_inventory);
    case 'XRP':
      return pickNum(sw.xrp_pending_inventory);
    case 'USDT':
      return pickNum(sw.usdt_pending_inventory);
    case 'USDC':
      return pickNum(sw.usdc_pending_inventory);
    default:
      return 0;
  }
}

/** Total treasury crypto on books (hot inventory + pending deposit bucket). */
export function systemTreasuryCryptoTotalQty(sw: SystemWalletRow | null | undefined, symbol: string): number {
  return systemInventoryAmount(sw, symbol) + systemPendingInventoryAmount(sw, symbol);
}
