-- NGN Flutterwave settlement rail: dedicated Wema account (treasury_bank_accounts.external_ref = FW_SETTLEMENT_NGN).

UPDATE public.treasury_bank_accounts
SET
  bank_name = 'Wema Bank PLC',
  metadata = COALESCE(metadata, '{}'::jsonb)
    || jsonb_build_object(
      'account_holder_name',
      'Flutterwave/Noble Edge Reality Estate Ltd',
      'account_number',
      '7353539763',
      'settlement_bank_name',
      'Wema Bank PLC'
    ),
  updated_at = NOW()
WHERE external_ref = 'FW_SETTLEMENT_NGN';
