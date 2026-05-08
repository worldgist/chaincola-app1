// Web-friendly wrappers for buy/sell operations.
// The mobile repo contains a full implementation; for the Next.js app we
// provide lightweight wrappers that call Supabase Edge Functions.

import { getSupabaseAnonKey, getSupabaseUrl } from '@/lib/supabase/resolved-env'
import { createClient } from '@/lib/supabase/client'

const SUPABASE_URL = getSupabaseUrl()
const SUPABASE_ANON_KEY = getSupabaseAnonKey()
const supabase = createClient()

async function callFunction(slug: string, body: any) {
	const url = `${SUPABASE_URL}/functions/v1/${slug}`;
	const res = await fetch(url, {
		method: 'POST',
		headers: {
			'Content-Type': 'application/json',
			...(SUPABASE_ANON_KEY ? { apikey: SUPABASE_ANON_KEY } : {}),
		},
		body: JSON.stringify(body || {}),
	});

	const json = await res.json().catch(() => null);
	if (!res.ok) {
		const message = json?.error || json?.message || `Function ${slug} failed with ${res.status}`;
		throw new Error(message);
	}
	return json;
}

async function callAuthedFunction(slug: string, body: any) {
	const { data: { session } } = await supabase.auth.getSession()
	if (!session?.access_token) {
		throw new Error('Not authenticated')
	}

	const url = `${SUPABASE_URL}/functions/v1/${slug}`;
	const res = await fetch(url, {
		method: 'POST',
		headers: {
			'Content-Type': 'application/json',
			'Authorization': `Bearer ${session.access_token}`,
			...(SUPABASE_ANON_KEY ? { apikey: SUPABASE_ANON_KEY } : {}),
		},
		body: JSON.stringify(body || {}),
	});

	const json = await res.json().catch(() => null);
	if (!res.ok) {
		const message = json?.error || json?.message || `Function ${slug} failed with ${res.status}`;
		throw new Error(message);
	}
	return json;
}

// BTC
export async function getSellBtcQuote(request: any) {
	return callFunction('sell-btc', { action: 'quote', ...request });
}

export async function executeSellBtc(request: any) {
	return callFunction('sell-btc', { action: 'execute', ...request });
}

export async function getSellBtcStatus(request: any) {
	return callFunction('sell-btc', { action: 'status', ...request });
}

// ETH
export async function getSellEthQuote(request: any) {
	return callFunction('sell-eth', { action: 'quote', ...request });
}

export async function executeSellEth(request: any) {
	return callFunction('sell-eth', { action: 'execute', ...request });
}

export async function getSellEthStatus(request: any) {
	return callFunction('sell-eth', { action: 'status', ...request });
}

// SOL
export async function getSellSolQuote(request: any) {
	return callFunction('sell-sol', { action: 'quote', ...request });
}

export async function executeSellSol(request: any) {
	return callFunction('sell-sol', { action: 'execute', ...request });
}

export async function getSellSolStatus(request: any) {
	return callFunction('sell-sol', { action: 'status', ...request });
}

// XRP
export async function getSellXrpQuote(request: any) {
	return callFunction('sell-xrp', { action: 'quote', ...request });
}

export async function executeSellXrp(request: any) {
	return callFunction('sell-xrp', { action: 'execute', ...request });
}

export async function getSellXrpStatus(request: any) {
	return callFunction('sell-xrp', { action: 'status', ...request });
}

// Send ETH (used by send-crypto page)
export async function sendEthereum(request: { destination_address: string; amount_eth: string }) {
	return callAuthedFunction('send-ethereum-transaction', request);
}

export async function sendBitcoin(request: { destination_address: string; amount_btc: string }) {
	return callAuthedFunction('send-bitcoin-transaction', request);
}

export async function sendUsdt(request: { destination_address: string; amount_usdt: string }) {
	return callAuthedFunction('send-usdt-transaction', request);
}

export async function sendUsdc(request: { destination_address: string; amount_usdc: string }) {
	return callAuthedFunction('send-usdc-transaction', request);
}

// Utility / sync functions used by admin
export async function forceSyncETHDeposits() {
	return callFunction('force-sync-eth-deposits', {});
}

export async function syncETHBalance(userId: string) {
	return callFunction('manual-sync-eth-balance', { user_id: userId });
}

// Generic exports so older imports still resolve
export default {
	getSellBtcQuote,
	executeSellBtc,
	getSellBtcStatus,
	getSellEthQuote,
	executeSellEth,
	getSellEthStatus,
	getSellSolQuote,
	executeSellSol,
	getSellSolStatus,
	getSellXrpQuote,
	executeSellXrp,
	getSellXrpStatus,
	sendEthereum,
	sendBitcoin,
	sendUsdt,
	sendUsdc,
	forceSyncETHDeposits,
	syncETHBalance,
};
