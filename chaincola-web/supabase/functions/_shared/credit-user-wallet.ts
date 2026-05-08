/**
 * credit_wallet() in Postgres can return FALSE on errors (swallowed by EXCEPTION handler)
 * without setting an RPC error — callers must check both `error` and `data`.
 */
export async function creditUserWallet(
  supabase: any,
  userId: string,
  amount: number,
  currency: string,
): Promise<{ ok: true } | { ok: false; message: string }> {
  const cur = (currency || "NGN").toUpperCase();
  if (cur !== "NGN" && cur !== "USD") {
    return { ok: false, message: `Unsupported currency for wallet credit: ${currency}` };
  }

  const { data, error } = await supabase.rpc("credit_wallet", {
    p_user_id: userId,
    p_amount: amount,
    p_currency: cur,
  });

  if (error) {
    return { ok: false, message: error.message || String(error) };
  }
  if (data === false) {
    return {
      ok: false,
      message:
        "credit_wallet returned false (database rejected the credit — check wallet tables and currency)",
    };
  }
  return { ok: true };
}
