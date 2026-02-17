-- Fix admin_view_verifications function result type mismatch
-- Issue: "structure of query does not match function result type"
-- Root Cause: Type mismatches or column order issues when joining auth.users
-- Fix: Ensure exact type matching and proper column ordering

DROP FUNCTION IF EXISTS public.admin_view_verifications(UUID, TEXT, INTEGER, INTEGER);

CREATE OR REPLACE FUNCTION public.admin_view_verifications(
  p_admin_user_id UUID,
  p_status TEXT DEFAULT NULL, -- 'pending', 'approved', 'rejected', or NULL for all
  p_limit INTEGER DEFAULT 50,
  p_offset INTEGER DEFAULT 0
)
RETURNS TABLE(
  id UUID,
  user_id UUID,
  full_name TEXT,
  phone_number TEXT,
  address TEXT,
  nin TEXT,
  nin_front_url TEXT,
  nin_back_url TEXT,
  passport_photo_url TEXT,
  status TEXT,
  submitted_at TIMESTAMPTZ,
  reviewed_at TIMESTAMPTZ,
  reviewed_by UUID,
  rejection_reason TEXT,
  created_at TIMESTAMPTZ,
  updated_at TIMESTAMPTZ,
  user_email TEXT,
  reviewer_email TEXT
) AS $$
BEGIN
  -- Check if admin
  IF NOT public.is_user_admin(p_admin_user_id) THEN
    RAISE EXCEPTION 'Only admins can view verifications';
  END IF;
  
  -- Return verifications with user and reviewer emails
  -- Ensure exact type matching and column order matches RETURNS TABLE
  RETURN QUERY
  SELECT 
    av.id::UUID,
    av.user_id::UUID,
    av.full_name::TEXT,
    av.phone_number::TEXT,
    av.address::TEXT,
    av.nin::TEXT,
    av.nin_front_url::TEXT,
    av.nin_back_url::TEXT,
    av.passport_photo_url::TEXT,
    av.status::TEXT,
    av.submitted_at::TIMESTAMPTZ,
    av.reviewed_at::TIMESTAMPTZ,
    av.reviewed_by::UUID,
    av.rejection_reason::TEXT,
    av.created_at::TIMESTAMPTZ,
    av.updated_at::TIMESTAMPTZ,
    COALESCE(u.email::TEXT, '') AS user_email,
    COALESCE(reviewer.email::TEXT, '') AS reviewer_email
  FROM public.account_verifications av
  LEFT JOIN auth.users u ON u.id = av.user_id
  LEFT JOIN auth.users reviewer ON reviewer.id = av.reviewed_by
  WHERE (p_status IS NULL OR av.status = p_status)
  ORDER BY av.submitted_at DESC
  LIMIT p_limit
  OFFSET p_offset;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Grant execute permissions
GRANT EXECUTE ON FUNCTION public.admin_view_verifications(UUID, TEXT, INTEGER, INTEGER) TO authenticated, service_role;

-- Add comment
COMMENT ON FUNCTION public.admin_view_verifications IS 'Admin function to view all verifications with filtering. Returns verifications with user and reviewer email addresses. Fixed result type mismatch issue.';
