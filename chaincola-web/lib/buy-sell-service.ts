// Web-friendly wrappers for buy/sell operations.
// The mobile repo contains a full implementation; for the Next.js app we
// provide lightweight wrappers that call Supabase Edge Functions.

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL || 'https://slleojsdpctxhlsoyenr.supabase.co';
const SUPABASE_ANON_KEY = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || '';

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
	return callFunction('send-ethereum-transaction', request);
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
	forceSyncETHDeposits,
	syncETHBalance,
};
