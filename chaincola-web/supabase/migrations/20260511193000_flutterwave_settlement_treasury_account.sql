-- Dedicated Flutterwave settlement account row for treasury reconciliation (payout subaccount balance sync).
INSERT INTO public.treasury_bank_accounts (
  bank_name,
  provider,
  external_ref,
  currency,
  reported_balance_ngn,
  sort_order,
  metadata,
  is_active
)
SELECT
  'Cashconnect Microfinance Bank',
  'FLUTTERWAVE',
  'FW_SETTLEMENT_NGN',
  'NGN',
  0,
  5,
  jsonb_build_object(
    'role',
    'flutterwave_settlement',
    'account_holder_name',
    'Flutterwave/Noble Edge Reality Estate Ltd',
    'account_number',
    '9922828144',
    'settlement_bank_name',
    'Cashconnect Microfinance Bank',
    'note',
    'Set metadata.payout_subaccount_reference to your Flutterwave Payout Subaccount reference (Dashboard). Resolution order: request body → this row metadata → Edge secret FLUTTERWAVE_SETTLEMENT_PAYOUT_SUBACCOUNT_REF.'
  ),
  true
WHERE NOT EXISTS (
  SELECT 1 FROM public.treasury_bank_accounts t WHERE t.external_ref = 'FW_SETTLEMENT_NGN'
);
