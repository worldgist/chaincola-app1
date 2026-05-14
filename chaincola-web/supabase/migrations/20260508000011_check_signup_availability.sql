-- Allow anonymous signup flow to detect existing email (auth.users) and phone
-- without exposing user_profiles rows through RLS.

CREATE OR REPLACE FUNCTION public.signup_phone_digits(input text)
RETURNS text
LANGUAGE sql
IMMUTABLE
AS $$
  SELECT NULLIF(regexp_replace(trim(COALESCE(input, '')), '\D', '', 'g'), '');
$$;

-- Nigerian mobiles: 0XXXXXXXXXX -> 234XXXXXXXXXX; 10 digits starting 7/8/9 -> 234...
CREATE OR REPLACE FUNCTION public.signup_canonical_phone(digits text)
RETURNS text
LANGUAGE sql
IMMUTABLE
AS $$
  SELECT CASE
    WHEN digits IS NULL OR digits = '' THEN ''
    WHEN length(digits) = 11 AND left(digits, 1) = '0' THEN '234' || substring(digits from 2)
    WHEN length(digits) = 10 AND left(digits, 1) IN ('7', '8', '9') THEN '234' || digits
    ELSE digits
  END;
$$;

CREATE OR REPLACE FUNCTION public.signup_phones_equivalent(stored_phone text, input_phone text)
RETURNS boolean
LANGUAGE sql
IMMUTABLE
AS $$
  SELECT public.signup_canonical_phone(public.signup_phone_digits(stored_phone)) <> ''
    AND public.signup_canonical_phone(public.signup_phone_digits(stored_phone)) =
        public.signup_canonical_phone(public.signup_phone_digits(input_phone))
    AND length(public.signup_canonical_phone(public.signup_phone_digits(input_phone))) >= 12;
$$;

CREATE OR REPLACE FUNCTION public.check_signup_availability(p_email text, p_phone text)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, auth, pg_catalog
AS $$
DECLARE
  v_email text := lower(trim(COALESCE(p_email, '')));
  v_phone_raw text := public.signup_phone_digits(p_phone);
  v_email_exists boolean := false;
  v_phone_exists boolean := false;
BEGIN
  IF v_email <> '' THEN
    SELECT EXISTS (
      SELECT 1
      FROM auth.users u
      WHERE u.email IS NOT NULL AND lower(trim(u.email::text)) = v_email
    ) INTO v_email_exists;
  END IF;

  IF trim(COALESCE(p_phone, '')) <> '' AND v_phone_raw IS NOT NULL AND length(v_phone_raw) >= 10 THEN
    SELECT EXISTS (
      SELECT 1
      FROM public.user_profiles up
      WHERE up.phone_number IS NOT NULL
        AND trim(up.phone_number) <> ''
        AND (
          public.signup_phones_equivalent(up.phone_number, p_phone)
          OR public.signup_phone_digits(up.phone_number) = v_phone_raw
        )
    ) INTO v_phone_exists;

    IF NOT v_phone_exists THEN
      SELECT EXISTS (
        SELECT 1
        FROM auth.users u
        WHERE public.signup_phone_digits(COALESCE(u.raw_user_meta_data->>'phone_number', '')) <> ''
          AND (
            public.signup_phones_equivalent(u.raw_user_meta_data->>'phone_number', p_phone)
            OR public.signup_phone_digits(u.raw_user_meta_data->>'phone_number') = v_phone_raw
          )
      ) INTO v_phone_exists;
    END IF;
  END IF;

  RETURN jsonb_build_object(
    'email_exists', COALESCE(v_email_exists, false),
    'phone_exists', COALESCE(v_phone_exists, false)
  );
END;
$$;

REVOKE ALL ON FUNCTION public.signup_phone_digits(text) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.signup_canonical_phone(text) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.signup_phones_equivalent(text, text) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.check_signup_availability(text, text) FROM PUBLIC;

GRANT EXECUTE ON FUNCTION public.check_signup_availability(text, text) TO anon, authenticated, service_role;

COMMENT ON FUNCTION public.check_signup_availability(text, text) IS
  'Returns whether email exists in auth.users and/or phone exists in profiles or auth metadata. Callable by anon for signup.';
