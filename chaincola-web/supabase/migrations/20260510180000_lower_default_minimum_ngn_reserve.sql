-- Align stored treasury risk default with product: minimum NGN float reserve ₦10,000 (was ₦1,000,000).
UPDATE public.app_settings
SET additional_settings = jsonb_set(
  COALESCE(additional_settings, '{}'::jsonb),
  '{risk_settings,minimum_ngn_reserve}',
  '10000'::jsonb,
  true
)
WHERE id = 1
AND (
  additional_settings->'risk_settings' IS NULL
  OR additional_settings->'risk_settings'->'minimum_ngn_reserve' IS NULL
  OR (additional_settings->'risk_settings'->>'minimum_ngn_reserve')::numeric = 1000000
);
