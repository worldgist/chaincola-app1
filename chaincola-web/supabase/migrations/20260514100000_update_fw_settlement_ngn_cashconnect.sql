-- NGN Flutterwave settlement rail: Cashconnect Microfinance Bank (FW_SETTLEMENT_NGN).

UPDATE public.treasury_bank_accounts
SET
  bank_name = 'Cashconnect Microfinance Bank',
  metadata = COALESCE(metadata, '{}'::jsonb)
    || jsonb_build_object(
      'account_holder_name',
      'Flutterwave/Noble Edge Reality Estate Ltd',
      'account_number',
      '9922828144',
      'settlement_bank_name',
      'Cashconnect Microfinance Bank'
    ),
  updated_at = NOW()
WHERE external_ref = 'FW_SETTLEMENT_NGN';
