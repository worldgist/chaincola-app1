-- Remove references to non-existent verification_status column in user_profiles
-- Verification status is stored in account_verifications table, not user_profiles

-- Fix admin_approve_verification function - remove user_profiles update
CREATE OR REPLACE FUNCTION public.admin_approve_verification(
  p_verification_id UUID,
  p_admin_user_id UUID
)
RETURNS JSONB AS $$
DECLARE
  v_verification RECORD;
  v_user_email TEXT;
  v_user_name TEXT;
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
  
  -- Update verification status (verification status is stored in account_verifications table)
  UPDATE public.account_verifications
  SET 
    status = 'approved',
    reviewed_at = NOW(),
    reviewed_by = p_admin_user_id,
    updated_at = NOW()
  WHERE id = p_verification_id;
  
  -- Note: We don't update user_profiles.verification_status because that column doesn't exist.
  -- Verification status is stored in account_verifications table.
  
  -- Get user email and name for notifications
  v_user_email := v_verification.email;
  v_user_name := COALESCE(v_verification.full_name, 'User');
  
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

-- Fix admin_reject_verification function - remove user_profiles update
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
  
  -- Update verification status (verification status is stored in account_verifications table)
  UPDATE public.account_verifications
  SET 
    status = 'rejected',
    reviewed_at = NOW(),
    reviewed_by = p_admin_user_id,
    rejection_reason = p_rejection_reason,
    updated_at = NOW()
  WHERE id = p_verification_id;
  
  -- Note: We don't update user_profiles.verification_status because that column doesn't exist.
  -- Verification status is stored in account_verifications table.
  
  -- Get user email and name for notifications
  v_user_email := v_verification.email;
  v_user_name := COALESCE(v_verification.full_name, 'User');
  
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
        p_rejection_reason
      )
    )
  );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Grant execute permissions
GRANT EXECUTE ON FUNCTION public.admin_approve_verification(UUID, UUID) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.admin_reject_verification(UUID, UUID, TEXT) TO authenticated, service_role;

-- Add comments
COMMENT ON FUNCTION public.admin_approve_verification IS 'Admin function to approve verification. Verification status is stored in account_verifications table.';
COMMENT ON FUNCTION public.admin_reject_verification IS 'Admin function to reject verification with reason. Verification status is stored in account_verifications table.';
