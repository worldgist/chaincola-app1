/**
 * Instant sell — on-chain custody context (post-ledger).
 *
 * Instant sell settles NGN + treasury on the DB ledger first. Actual coins may still sit on
 * the user's deposit address until auto-sweep / send-* edge functions move them to treasury.
 * This module resolves treasury main + user deposit addresses and builds a client-friendly plan.
 */

import type { SupabaseClient } from "https://esm.sh/@supabase/supabase-js@2";

export type InstantSellAsset = "BTC" | "ETH" | "USDT" | "USDC" | "XRP" | "SOL";

export type InstantSellOnChainTransferPlan = {
  model: "ledger_then_custody_sweep";
  /** Ledger leg always completes inside instant_sell_crypto_v2. */
  ledger_instant_settled: true;
  /** No chain tx is broadcast from the instant-sell edge function itself. */
  blockchain_broadcast_in_instant_sell_rpc: false;
  asset: InstantSellAsset;
  amount_crypto: number;
  treasury_main_address: string | null;
  treasury_address_network: string | null;
  user_deposit_address: string | null;
  user_deposit_network: string | null;
  /** Human-readable one-liner for API / admin. */
  summary: string;
  /** Where operators should look for the actual sweep. */
  sweep_recommended_functions: string[];
};

const SWEEP_HINTS = [
  "auto-sweep-engine (scheduled deposit sweeps)",
  "send-bitcoin-transaction / send-ethereum-transaction / send-solana-transaction / send-xrp-transaction / send-usdt-transaction / send-usdc-transaction",
];

function readUsdtTreasury(
  systemRow: Record<string, unknown>,
): { address: string | null; network: string } {
  const eth = systemRow.usdt_eth_main_address;
  if (typeof eth === "string" && eth.trim() !== "") {
    return { address: eth.trim(), network: "ethereum_erc20" };
  }
  const tron = systemRow.usdt_tron_main_address;
  if (typeof tron === "string" && tron.trim() !== "") {
    return { address: tron.trim(), network: "tron_trc20" };
  }
  const sol = systemRow.usdt_sol_main_address;
  if (typeof sol === "string" && sol.trim() !== "") {
    return { address: sol.trim(), network: "solana_spl" };
  }
  return { address: null, network: "" };
}

function readUsdcTreasury(
  systemRow: Record<string, unknown>,
): { address: string | null; network: string } {
  const eth = systemRow.usdc_eth_main_address;
  if (typeof eth === "string" && eth.trim() !== "") {
    return { address: eth.trim(), network: "ethereum_erc20" };
  }
  const sol = systemRow.usdc_sol_main_address;
  if (typeof sol === "string" && sol.trim() !== "") {
    return { address: sol.trim(), network: "solana" };
  }
  return { address: null, network: "" };
}

function treasuryFieldForAsset(asset: string): { col: string; network: string } {
  const a = asset.toUpperCase();
  switch (a) {
    case "BTC":
      return { col: "btc_main_address", network: "bitcoin" };
    case "ETH":
      return { col: "eth_main_address", network: "ethereum" };
    case "SOL":
      return { col: "sol_main_address", network: "solana" };
    case "XRP":
      return { col: "xrp_main_address", network: "xrp" };
    case "USDT":
      return { col: "", network: "" };
    case "USDC":
      return { col: "", network: "" };
    default:
      return { col: "", network: "" };
  }
}

function readTreasuryAddress(
  systemRow: Record<string, unknown> | null,
  asset: string,
): { address: string | null; network: string } {
  if (!systemRow) return { address: null, network: "" };
  const a = asset.toUpperCase();
  if (a === "USDC") {
    return readUsdcTreasury(systemRow);
  }
  if (a === "USDT") {
    return readUsdtTreasury(systemRow);
  }
  const { col, network } = treasuryFieldForAsset(asset);
  if (!col) return { address: null, network: "" };
  const raw = systemRow[col];
  const address = typeof raw === "string" && raw.trim() !== "" ? raw.trim() : null;
  return { address, network };
}

function pickUserCryptoWallet(
  rows: Array<{ address: string; asset: string; network: string | null }>,
  asset: string,
): { address: string; network: string | null } | null {
  const up = asset.toUpperCase();
  const same = rows.filter((r) => String(r.asset).toUpperCase() === up);
  if (same.length === 0) return null;
  if (up === "USDT") {
    const eth = same.find((r) => (r.network || "").toLowerCase().includes("eth"));
    if (eth) return eth;
    const tron = same.find((r) => {
      const n = (r.network || "").toLowerCase();
      return n.includes("tron") || n.includes("trc") || n === "trx";
    });
    if (tron) return tron;
    const sol = same.find((r) => (r.network || "").toLowerCase().includes("sol"));
    if (sol) return sol;
    return same[0];
  }
  if (up === "USDC") {
    const eth = same.find((r) => (r.network || "").toLowerCase().includes("eth"));
    if (eth) return eth;
    const sol = same.find((r) => (r.network || "").toLowerCase().includes("sol"));
    if (sol) return sol;
  }
  return same[0];
}

/**
 * Build the on-chain custody plan shown to clients after a successful instant sell.
 */
export async function getInstantSellOnChainTransferPlan(
  supabase: SupabaseClient,
  params: {
    userId: string;
    asset: string;
    amountCrypto: number;
  },
): Promise<InstantSellOnChainTransferPlan> {
  const asset = params.asset.toUpperCase() as InstantSellAsset;

  const { data: sw } = await supabase
    .from("system_wallets")
    .select(
      "btc_main_address, eth_main_address, sol_main_address, xrp_main_address, usdt_eth_main_address, usdt_tron_main_address, usdt_sol_main_address, usdc_eth_main_address, usdc_sol_main_address",
    )
    .eq("id", 1)
    .maybeSingle();

  const treasury = readTreasuryAddress(
    sw as Record<string, unknown> | null,
    asset,
  );

  const { data: wallets } = await supabase
    .from("crypto_wallets")
    .select("address, asset, network")
    .eq("user_id", params.userId)
    .eq("is_active", true);

  const userPick = pickUserCryptoWallet(
    (wallets || []) as Array<{ address: string; asset: string; network: string | null }>,
    asset,
  );

  const summaryParts = [
    `Ledger sell completed for ${params.amountCrypto} ${asset}.`,
    treasury.address
      ? `Treasury main (custody target): ${treasury.address} (${treasury.network}).`
      : "Treasury main address not configured on system_wallets.",
    userPick?.address
      ? `User deposit address (on-chain source for sweep): ${userPick.address}${userPick.network ? ` (${userPick.network})` : ""}.`
      : "No active user crypto_wallets row for this asset; sweep may not apply until a deposit wallet exists.",
    "Blockchain broadcast is handled outside this RPC (sweep / send-* functions).",
  ];

  return {
    model: "ledger_then_custody_sweep",
    ledger_instant_settled: true,
    blockchain_broadcast_in_instant_sell_rpc: false,
    asset,
    amount_crypto: params.amountCrypto,
    treasury_main_address: treasury.address,
    treasury_address_network: treasury.network || null,
    user_deposit_address: userPick?.address ?? null,
    user_deposit_network: userPick?.network ?? null,
    summary: summaryParts.join(" "),
    sweep_recommended_functions: SWEEP_HINTS,
  };
}

/**
 * Merge on-chain plan into the SELL transaction row for ops / reconciliation (best-effort).
 */
export async function mergeInstantSellOnChainIntoTransaction(
  supabase: SupabaseClient,
  transactionId: string,
  plan: InstantSellOnChainTransferPlan,
): Promise<{ ok: boolean; error?: string }> {
  try {
    const { data, error } = await supabase
      .from("transactions")
      .select("metadata")
      .eq("id", transactionId)
      .maybeSingle();

    if (error) {
      return { ok: false, error: error.message };
    }
    if (!data) {
      return { ok: false, error: "transaction_not_found" };
    }

    const prev = (data.metadata && typeof data.metadata === "object")
      ? (data.metadata as Record<string, unknown>)
      : {};

    const next = {
      ...prev,
      instant_sell_on_chain: plan,
    };

    const { error: uErr } = await supabase
      .from("transactions")
      .update({ metadata: next })
      .eq("id", transactionId);

    if (uErr) {
      return { ok: false, error: uErr.message };
    }
    return { ok: true };
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    return { ok: false, error: msg };
  }
}
