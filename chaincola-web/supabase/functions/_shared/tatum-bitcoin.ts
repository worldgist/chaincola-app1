/**
 * Tatum Bitcoin mainnet gateway (REST v3 on gateway host).
 * Secrets: TATUM_API_KEY (required). Optional: TATUM_BITCOIN_GATEWAY_URL (default bitcoin-mainnet.gateway.tatum.io).
 */

const DEFAULT_GATEWAY = "https://bitcoin-mainnet.gateway.tatum.io";

export function getTatumBitcoinGatewayBase(): string {
  return (Deno.env.get("TATUM_BITCOIN_GATEWAY_URL") || DEFAULT_GATEWAY).replace(/\/$/, "");
}

/** Primary secret name; optional alias TATUM_KEY for backwards compatibility. */
export function getTatumApiKey(): string {
  return (Deno.env.get("TATUM_API_KEY") || Deno.env.get("TATUM_KEY") || "").trim();
}

/** Human-readable error if the project secret is missing (check before calling Tatum). */
export function getTatumApiKeyMissingMessage(): string {
  return (
    "TATUM_API_KEY is not set. Add it in Supabase Dashboard → Project Settings → Edge Functions → Secrets " +
    "(same as `supabase secrets set TATUM_API_KEY=...`). Optional: TATUM_BITCOIN_GATEWAY_URL defaults to " +
    DEFAULT_GATEWAY + "."
  );
}

export async function tatumGetJson(pathWithLeadingSlash: string, search?: URLSearchParams): Promise<unknown> {
  const key = getTatumApiKey();
  if (!key) {
    throw new Error(getTatumApiKeyMissingMessage());
  }
  const base = getTatumBitcoinGatewayBase();
  const q = search && [...search].length > 0 ? `?${search.toString()}` : "";
  const url = `${base}${pathWithLeadingSlash.startsWith("/") ? pathWithLeadingSlash : `/${pathWithLeadingSlash}`}${q}`;
  const res = await fetch(url, {
    headers: {
      "x-api-key": key,
      Accept: "application/json",
    },
  });
  const text = await res.text();
  let json: unknown = null;
  try {
    json = text ? JSON.parse(text) : null;
  } catch {
    // non-JSON body
  }
  if (!res.ok) {
    const msg =
      typeof json === "object" && json != null && "message" in json
        ? String((json as { message?: string }).message)
        : text.slice(0, 200);
    throw new Error(`Tatum HTTP ${res.status}: ${msg}`);
  }
  return json;
}

export async function tatumBtcCurrentBlockHeight(): Promise<number> {
  const j = (await tatumGetJson("/v3/bitcoin/info")) as { blocks?: number; headers?: number };
  const h = typeof j.blocks === "number" ? j.blocks : typeof j.headers === "number" ? j.headers : NaN;
  if (!Number.isFinite(h) || h < 0) throw new Error("Tatum /v3/bitcoin/info: missing blocks height");
  return h;
}

/** Spendable-style net balance in BTC from Tatum address balance (confirmed + pending buckets). */
export async function tatumBtcAddressBalanceBtc(address: string): Promise<number> {
  const enc = encodeURIComponent(address.trim());
  const j = (await tatumGetJson(`/v3/bitcoin/address/balance/${enc}`)) as {
    incoming?: string;
    outgoing?: string;
    incomingPending?: string;
    outgoingPending?: string;
  };
  const inc = parseFloat(j.incoming || "0") + parseFloat(j.incomingPending || "0");
  const out = parseFloat(j.outgoing || "0") + parseFloat(j.outgoingPending || "0");
  const net = inc - out;
  return Number.isFinite(net) && net > 0 ? net : 0;
}

export type TatumBtcTx = {
  hash?: string;
  blockNumber?: number | null;
  outputs?: Array<{ address?: string; value?: number }>;
};

function sumIncomingBtcToAddress(tx: TatumBtcTx, address: string): number {
  const want = address.trim();
  let sats = 0;
  for (const o of tx.outputs || []) {
    const a = o.address?.trim();
    if (!a || o.value == null) continue;
    if (a === want || (want.toLowerCase().startsWith("bc1") && a.toLowerCase() === want.toLowerCase())) {
      sats += o.value;
    }
  }
  return sats / 1e8;
}

/** Incoming txs for address (newest first typical); pageSize 1–50 (Tatum). */
export async function tatumBtcIncomingTransactions(address: string, pageSize = 50, offset = 0): Promise<TatumBtcTx[]> {
  const enc = encodeURIComponent(address.trim());
  const sp = new URLSearchParams({
    pageSize: String(Math.min(50, Math.max(1, pageSize))),
    offset: String(Math.max(0, offset)),
    txType: "incoming",
  });
  const raw = (await tatumGetJson(`/v3/bitcoin/transaction/address/${enc}`, sp)) as unknown;
  if (!Array.isArray(raw)) return [];
  return raw as TatumBtcTx[];
}

export function tatumConfirmations(txBlockNumber: number | null | undefined, tipHeight: number): number {
  if (txBlockNumber == null || !Number.isFinite(txBlockNumber) || txBlockNumber < 0) return 0;
  return Math.max(0, tipHeight - txBlockNumber + 1);
}

export function incomingBtcAmount(tx: TatumBtcTx, depositAddress: string): number {
  return sumIncomingBtcToAddress(tx, depositAddress);
}
