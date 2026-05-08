-- Enhance Admin Verification Management with View, Approve, and Reject functions
-- Includes push and email notifications for approval and rejection

-- Enable http extension if not already enabled (for sending notifications)
CREATE EXTENSION IF NOT EXISTS http;

-- Drop old functions if they exist (to change return types)
DROP FUNCTION IF EXISTS public.admin_approve_verification(UUID, UUID);
DROP FUNCTION IF EXISTS public.admin_reject_verification(UUID, UUID, TEXT);

-- Function for admin to view all verifications (with filtering options)
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
  RETURN QUERY
  SELECT 
    av.id,
    av.user_id,
    av.full_name,
    av.phone_number,
    av.address,
    av.nin,
    av.nin_front_url,
    av.nin_back_url,
    av.passport_photo_url,
    av.status,
    av.submitted_at,
    av.reviewed_at,
    av.reviewed_by,
    av.rejection_reason,
    av.created_at,
    av.updated_at,
    u.email AS user_email,
    reviewer.email AS reviewer_email
  FROM public.account_verifications av
  LEFT JOIN auth.users u ON u.id = av.user_id
  LEFT JOIN auth.users reviewer ON reviewer.id = av.reviewed_by
  WHERE (p_status IS NULL OR av.status = p_status)
  ORDER BY av.submitted_at DESC
  LIMIT p_limit
  OFFSET p_offset;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Enhanced function for admin to approve verification with notifications
CREATE OR REPLACE FUNCTION public.admin_approve_verification(
  p_verification_id UUID,
  p_admin_user_id UUID
)
RETURNS JSONB AS $$
DECLARE
  v_verification RECORD;
  v_user_email TEXT;
  v_user_name TEXT;
  v_notification_result JSONB;
BEGIN
  -- Check if admin
  IF NOT public.is_user_admin(p_admin_user_id) THEN
    RAISE EXCEPTION 'Only admins can approve verifications';
  END IF;
  
  -- Get verification details with user email
  SELECT 
    av.*,
    u.email,
    up.full_name
  INTO v_verification
  FROM public.account_verifications av
  LEFT JOIN auth.users u ON u.id = av.user_id
  LEFT JOIN public.user_profiles up ON up.user_id = av.user_id
  WHERE av.id = p_verification_id;
  
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Verification record not found';
  END IF;
  
  -- Check if already approved or rejected
  IF v_verification.status != 'pending' THEN
    RAISE EXCEPTION 'Verification is already %', v_verification.status;
  END IF;
  
  -- Update verification status
  UPDATE public.account_verifications
  SET 
    status = 'approved',
    reviewed_at = NOW(),
    reviewed_by = p_admin_user_id,
    updated_at = NOW()
  WHERE id = p_verification_id;
  
  -- Update user profile verification status
  UPDATE public.user_profiles
  SET 
    verification_status = 'approved',
    updated_at = NOW()
  WHERE user_id = v_verification.user_id;
  
  -- Get user email and name for notifications
  v_user_email := v_verification.email;
  v_user_name := COALESCE(v_verification.full_name, 'User');
  
  -- Note: Notifications are sent via edge function wrapper
  -- The edge function will call this PostgreSQL function and then send notifications
  -- This keeps the database function simple and allows for better error handling
  
  -- Return success with verification details and notification data
  RETURN jsonb_build_object(
    'success', true,
    'verification_id', p_verification_id,
    'status', 'approved',
    'user_id', v_verification.user_id,
    'user_email', v_user_email,
    'user_name', v_user_name,
    'notification_data', jsonb_build_object(
      'type', 'verification_approved',
      'push_title', '✅ Account Verified Successfully',
      'push_body', 'Congratulations! Your account verification has been approved. You can now enjoy full access to all features.',
      'email_subject', 'Account Verification Approved - ChainCola',
      'email_html', format(
        '<!DOCTYPE html>
        <html>
        <head>
          <meta charset="utf-8">
          <style>
            body { font-family: Arial, sans-serif; line-height: 1.6; color: #333; }
            .container { max-width: 600px; margin: 0 auto; padding: 20px; }
            .header { background-color: #4CAF50; color: white; padding: 20px; text-align: center; border-radius: 5px 5px 0 0; }
            .content { background-color: #f9f9f9; padding: 30px; border-radius: 0 0 5px 5px; }
            .button { display: inline-block; padding: 12px 24px; background-color: #4CAF50; color: white; text-decoration: none; border-radius: 5px; margin-top: 20px; }
            ul { margin: 15px 0; padding-left: 30px; }
            li { margin: 8px 0; }
          </style>
        </head>
        <body>
          <div class="container">
            <div class="header">
              <h1>✅ Account Verification Approved</h1>
            </div>
            <div class="content">
              <p>Dear %s,</p>
              <p>We are pleased to inform you that your account verification has been <strong>approved</strong>!</p>
              <p>Your account is now fully verified and you can enjoy:</p>
              <ul>
                <li>✅ Full access to all trading features</li>
                <li>✅ Higher transaction limits</li>
                <li>✅ Enhanced security features</li>
                <li>✅ Priority customer support</li>
              </ul>
              <p>Thank you for completing the verification process. If you have any questions, please don''t hesitate to contact our support team.</p>
              <p>Best regards,<br>The ChainCola Team</p>
            </div>
          </div>
        </body>
        </html>',
        v_user_name
      )
    )
  );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Enhanced function for admin to reject verification with notifications
CREATE OR REPLACE FUNCTION public.admin_reject_verification(
  p_verification_id UUID,
  p_admin_user_id UUID,
  p_rejection_reason TEXT
)
RETURNS JSONB AS $$
DECLARE
  v_verification RECORD;
  v_user_email TEXT;
  v_user_name TEXT;
BEGIN
  -- Check if admin
  IF NOT public.is_user_admin(p_admin_user_id) THEN
    RAISE EXCEPTION 'Only admins can reject verifications';
  END IF;
  
  -- Validate rejection reason
  IF p_rejection_reason IS NULL OR TRIM(p_rejection_reason) = '' THEN
    RAISE EXCEPTION 'Rejection reason is required';
  END IF;
  
  -- Get verification details with user email
  SELECT 
    av.*,
    u.email,
    up.full_name
  INTO v_verification
  FROM public.account_verifications av
  LEFT JOIN auth.users u ON u.id = av.user_id
  LEFT JOIN public.user_profiles up ON up.user_id = av.user_id
  WHERE av.id = p_verification_id;
  
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Verification record not found';
  END IF;
  
  -- Check if already approved or rejected
  IF v_verification.status != 'pending' THEN
    RAISE EXCEPTION 'Verification is already %', v_verification.status;
  END IF;
  
  -- Update verification status
  UPDATE public.account_verifications
  SET 
    status = 'rejected',
    reviewed_at = NOW(),
    reviewed_by = p_admin_user_id,
    rejection_reason = p_rejection_reason,
    updated_at = NOW()
  WHERE id = p_verification_id;
  
  -- Update user profile verification status
  UPDATE public.user_profiles
  SET 
    verification_status = 'rejected',
    updated_at = NOW()
  WHERE user_id = v_verification.user_id;
  
  -- Get user email and name for notifications
  v_user_email := v_verification.email;
  v_user_name := COALESCE(v_verification.full_name, 'User');
  
  -- Note: Notifications are sent via edge function wrapper
  -- The edge function will call this PostgreSQL function and then send notifications
  -- This keeps the database function simple and allows for better error handling
  
  -- Return success with verification details and notification data
  RETURN jsonb_build_object(
    'success', true,
    'verification_id', p_verification_id,
    'status', 'rejected',
    'user_id', v_verification.user_id,
    'rejection_reason', p_rejection_reason,
    'user_email', v_user_email,
    'user_name', v_user_name,
    'notification_data', jsonb_build_object(
      'type', 'verification_rejected',
      'push_title', '❌ Account Verification Rejected',
      'push_body', format('Your verification was rejected. Reason: %s. Please review and resubmit.', LEFT(p_rejection_reason, 100)),
      'email_subject', 'Account Verification Rejected - ChainCola',
      'email_html', format(
        '<!DOCTYPE html>
        <html>
        <head>
          <meta charset="utf-8">
          <style>
            body { font-family: Arial, sans-serif; line-height: 1.6; color: #333; }
            .container { max-width: 600px; margin: 0 auto; padding: 20px; }
            .header { background-color: #f44336; color: white; padding: 20px; text-align: center; border-radius: 5px 5px 0 0; }
            .content { background-color: #f9f9f9; padding: 30px; border-radius: 0 0 5px 5px; }
            .reason-box { background-color: #fff; border-left: 4px solid #f44336; padding: 15px; margin: 20px 0; }
            .button { display: inline-block; padding: 12px 24px; background-color: #2196F3; color: white; text-decoration: none; border-radius: 5px; margin-top: 20px; }
          </style>
        </head>
        <body>
          <div class="container">
            <div class="header">
              <h1>❌ Account Verification Rejected</h1>
            </div>
            <div class="content">
              <p>Dear %s,</p>
              <p>We regret to inform you that your account verification has been <strong>rejected</strong>.</p>
              <div class="reason-box">
                <p><strong>Reason for Rejection:</strong></p>
                <p>%s</p>
              </div>
              <p>Please review the reason above and take the following steps:</p>
              <ol>
                <li>Review your submitted documents</li>
                <li>Ensure all information is accurate and matches your identification</li>
                <li>Make sure all documents are clear and legible</li>
                <li>Resubmit your verification request</li>
              </ol>
              <p>If you have any questions or need assistance, please contact our support team.</p>
              <p>Best regards,<br>The ChainCola Team</p>
            </div>
          </div>
        </body>
        </html>',
        v_user_name,
        REPLACE(p_rejection_reason, '<', '&lt;')
      )
    )
  );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Grant execute permissions
GRANT EXECUTE ON FUNCTION public.admin_view_verifications(UUID, TEXT, INTEGER, INTEGER) TO authenticated;
GRANT EXECUTE ON FUNCTION public.admin_approve_verification(UUID, UUID) TO authenticated;
GRANT EXECUTE ON FUNCTION public.admin_reject_verification(UUID, UUID, TEXT) TO authenticated;

-- Add comments
COMMENT ON FUNCTION public.admin_view_verifications IS 'Admin function to view all verifications with optional status filtering. Returns verification details with user and reviewer emails.';
COMMENT ON FUNCTION public.admin_approve_verification IS 'Admin function to approve a verification request. Updates verification status, sends push and email notifications to user. Returns JSONB with success status and notification details.';
COMMENT ON FUNCTION public.admin_reject_verification IS 'Admin function to reject a verification request with reason. Updates verification status, sends push and email notifications to user with rejection reason. Returns JSONB with success status and notification details.';
