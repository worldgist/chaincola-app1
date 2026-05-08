-- Fix admin_approve_verification function return type to match edge function expectations
-- The function must return notification_data, user_email, and user_id fields

DROP FUNCTION IF EXISTS public.admin_approve_verification(UUID, UUID);

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
  
  -- Return success with verification details and notification data
  -- This structure matches what the edge function expects
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

-- Grant execute permissions
GRANT EXECUTE ON FUNCTION public.admin_approve_verification(UUID, UUID) TO authenticated;

-- Add comment
COMMENT ON FUNCTION public.admin_approve_verification IS 'Admin function to approve a verification request. Updates verification status and returns JSONB with notification data for edge function to send push and email notifications.';
