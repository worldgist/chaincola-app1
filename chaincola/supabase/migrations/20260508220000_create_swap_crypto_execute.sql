-- Atomic crypto-to-crypto swap using internal inventory.
-- Expects:
--   public.user_wallets (user_id uuid PK, btc_balance, eth_balance, usdt_balance, usdc_balance, xrp_balance, sol_balance numeric, …)
--   public.system_wallet (id int PK, btc_inventory, eth_inventory, … numeric, …)
--
-- Called only from the swap-crypto Edge Function with service_role (not exposed to anon clients).

create or replace function public.swap_crypto_execute(
  p_user_id uuid,
  p_from_asset text,
  p_to_asset text,
  p_from_amount numeric,
  p_to_amount numeric,
  p_value_in_ngn numeric,
  p_swap_fee numeric,
  p_from_sell_price numeric,
  p_to_buy_price numeric,
  p_rate_source text
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  from_balance_col text;
  to_balance_col text;
  from_inv_col text;
  to_inv_col text;
  sys_row record;
  user_from_balance numeric;
  system_to_inventory numeric;
  swap_id uuid := gen_random_uuid();
  new_from_balance numeric;
  new_to_balance numeric;
  new_sys_from_inv numeric;
  new_sys_to_inv numeric;
begin
  if p_from_amount is null or p_from_amount <= 0 then
    raise exception 'Invalid from_amount';
  end if;
  if p_to_amount is null or p_to_amount <= 0 then
    raise exception 'Invalid to_amount';
  end if;
  if p_from_asset is null or p_to_asset is null or upper(p_from_asset) = upper(p_to_asset) then
    raise exception 'Invalid assets';
  end if;

  case upper(p_from_asset)
    when 'BTC' then from_balance_col := 'btc_balance'; from_inv_col := 'btc_inventory';
    when 'ETH' then from_balance_col := 'eth_balance'; from_inv_col := 'eth_inventory';
    when 'USDT' then from_balance_col := 'usdt_balance'; from_inv_col := 'usdt_inventory';
    when 'USDC' then from_balance_col := 'usdc_balance'; from_inv_col := 'usdc_inventory';
    when 'XRP' then from_balance_col := 'xrp_balance'; from_inv_col := 'xrp_inventory';
    when 'SOL' then from_balance_col := 'sol_balance'; from_inv_col := 'sol_inventory';
    else
      raise exception 'Unsupported from_asset %', p_from_asset;
  end case;

  case upper(p_to_asset)
    when 'BTC' then to_balance_col := 'btc_balance'; to_inv_col := 'btc_inventory';
    when 'ETH' then to_balance_col := 'eth_balance'; to_inv_col := 'eth_inventory';
    when 'USDT' then to_balance_col := 'usdt_balance'; to_inv_col := 'usdt_inventory';
    when 'USDC' then to_balance_col := 'usdc_balance'; to_inv_col := 'usdc_inventory';
    when 'XRP' then to_balance_col := 'xrp_balance'; to_inv_col := 'xrp_inventory';
    when 'SOL' then to_balance_col := 'sol_balance'; to_inv_col := 'sol_inventory';
    else
      raise exception 'Unsupported to_asset %', p_to_asset;
  end case;

  perform 1 from public.user_wallets where user_id = p_user_id for update;
  if not found then
    raise exception 'User wallet not found';
  end if;

  select * into sys_row
  from public.system_wallet
  order by id asc
  limit 1
  for update;

  if not found or sys_row.id is null then
    raise exception 'System wallet not found';
  end if;

  execute format('select %I from public.user_wallets where user_id = $1', from_balance_col)
    into user_from_balance
    using p_user_id;

  execute format('select %I from public.system_wallet where id = $1', to_inv_col)
    into system_to_inventory
    using sys_row.id;

  if coalesce(user_from_balance, 0) < p_from_amount then
    raise exception 'Insufficient balance';
  end if;

  if coalesce(system_to_inventory, 0) < p_to_amount then
    raise exception 'Insufficient system inventory for %', p_to_asset;
  end if;

  execute format(
    'update public.user_wallets
     set %I = %I - $2,
         %I = %I + $3
     where user_id = $1',
    from_balance_col, from_balance_col,
    to_balance_col, to_balance_col
  )
  using p_user_id, p_from_amount, p_to_amount;

  execute format(
    'update public.system_wallet
     set %I = %I + $2,
         %I = %I - $3
     where id = $1',
    from_inv_col, from_inv_col,
    to_inv_col, to_inv_col
  )
  using sys_row.id, p_from_amount, p_to_amount;

  execute format('select %I from public.user_wallets where user_id = $1', from_balance_col)
    into new_from_balance
    using p_user_id;
  execute format('select %I from public.user_wallets where user_id = $1', to_balance_col)
    into new_to_balance
    using p_user_id;
  execute format('select %I from public.system_wallet where id = $1', from_inv_col)
    into new_sys_from_inv
    using sys_row.id;
  execute format('select %I from public.system_wallet where id = $1', to_inv_col)
    into new_sys_to_inv
    using sys_row.id;

  return jsonb_build_object(
    'swap_id', swap_id,
    'from_asset', upper(p_from_asset),
    'to_asset', upper(p_to_asset),
    'from_amount', p_from_amount,
    'to_amount', p_to_amount,
    'value_in_ngn', p_value_in_ngn,
    'swap_fee', p_swap_fee,
    'exchange_rate', jsonb_build_object(
      'from_sell_price', p_from_sell_price,
      'to_buy_price', p_to_buy_price,
      'rate_source', p_rate_source
    ),
    'new_balances', jsonb_build_object(
      'from_balance', new_from_balance,
      'to_balance', new_to_balance,
      'system_from_inventory', new_sys_from_inv,
      'system_to_inventory', new_sys_to_inv
    )
  );
end;
$$;

revoke all on function public.swap_crypto_execute(
  uuid, text, text, numeric, numeric, numeric, numeric, numeric, numeric, text
) from public;

grant execute on function public.swap_crypto_execute(
  uuid, text, text, numeric, numeric, numeric, numeric, numeric, numeric, text
) to service_role;
