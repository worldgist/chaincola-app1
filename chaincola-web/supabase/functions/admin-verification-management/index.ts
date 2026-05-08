// Admin Verification Management Edge Function
// Wraps PostgreSQL functions and sends push/email notifications

import { serve } from 'https://deno.land/std@0.168.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

interface ApproveRequest {
  verification_id: string;
}

interface RejectRequest {
  verification_id: string;
  rejection_reason: string;
}

interface ViewRequest {
  status?: 'pending' | 'approved' | 'rejected';
  limit?: number;
  offset?: number;
}

/** supabase.functions.invoke returns { data, error } — not a fetch Response (no .json()). */
function logFunctionInvokeResult(label: string, data: unknown, error: unknown) {
  if (error) {
    console.error(`⚠️ ${label} invoke error:`, error);
    return;
  }
  const d = data as { success?: boolean; error?: string; message?: string; skipped?: boolean } | null;
  console.log(`📤 ${label} result:`, JSON.stringify(data, null, 2));
  if (d && d.success === false) {
    console.error(`⚠️ ${label} reported failure:`, d.error || d.message);
  }
}

serve(async (req) => {
  // Handle CORS preflight
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  try {
    // Get authorization header
    const authHeader = req.headers.get('Authorization');
    if (!authHeader) {
      return new Response(
        JSON.stringify({ success: false, error: 'Missing authorization header' }),
        { status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Create Supabase client
    const supabaseUrl = Deno.env.get('SUPABASE_URL') ?? '';
    const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '';
    const supabase = createClient(supabaseUrl, supabaseServiceKey);

    // Verify admin user
    const token = authHeader.replace('Bearer ', '');
    const { data: { user }, error: authError } = await supabase.auth.getUser(token);

    if (authError || !user) {
      return new Response(
        JSON.stringify({ success: false, error: 'Invalid or expired token' }),
        { status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Check if user is admin
    const { data: profile, error: profileError } = await supabase
      .from('user_profiles')
      .select('is_admin, role')
      .eq('user_id', user.id)
      .single();

    if (profileError || !profile || (!profile.is_admin && profile.role !== 'admin')) {
      return new Response(
        JSON.stringify({ success: false, error: 'Admin access required' }),
        { status: 403, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Extract admin user ID from authenticated session
    const adminUserId = user.id;

    // Parse request body
    const { action, ...params } = await req.json();

    if (!action) {
      return new Response(
        JSON.stringify({ success: false, error: 'Action is required' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    let result: any;

    switch (action) {
      case 'view':
        {
          const viewParams = params as ViewRequest;
          const { data, error } = await supabase.rpc('admin_view_verifications', {
            p_admin_user_id: adminUserId,
            p_status: viewParams.status || null,
            p_limit: viewParams.limit || 50,
            p_offset: viewParams.offset || 0,
          });

          if (error) {
            console.error('❌ Error viewing verifications:', error);
            return new Response(
              JSON.stringify({ success: false, error: error.message }),
              { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
            );
          }

          result = { success: true, data };
        }
        break;

      case 'approve':
        {
          const approveParams = params as ApproveRequest;
          
          // Call PostgreSQL function
          const { data: dbResult, error: dbError } = await supabase.rpc('admin_approve_verification', {
            p_verification_id: approveParams.verification_id,
            p_admin_user_id: adminUserId,
          });

          if (dbError) {
            console.error('❌ Database error approving verification:', dbError);
            return new Response(
              JSON.stringify({ success: false, error: dbError.message }),
              { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
            );
          }

          // Handle JSONB result - it might be wrapped in an array or returned directly
          // JSONB from PostgreSQL RPC might also be returned as a string that needs parsing
          let resultData: any;
          
          console.log('🔍 Raw dbResult from admin_approve_verification:', JSON.stringify(dbResult, null, 2));
          console.log('🔍 dbResult type:', typeof dbResult, 'isArray:', Array.isArray(dbResult));
          
          if (Array.isArray(dbResult) && dbResult.length > 0) {
            resultData = dbResult[0];
          } else if (dbResult && typeof dbResult === 'object') {
            resultData = dbResult;
          } else if (typeof dbResult === 'string') {
            // JSONB might be returned as a string
            try {
              resultData = JSON.parse(dbResult);
            } catch (parseError) {
              console.error('❌ Failed to parse JSONB string:', parseError);
              return new Response(
                JSON.stringify({ success: false, error: 'Failed to parse database result' }),
                { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
              );
            }
          } else {
            console.error('❌ Unexpected result format from admin_approve_verification:', {
              dbResult,
              type: typeof dbResult,
              isArray: Array.isArray(dbResult),
            });
            return new Response(
              JSON.stringify({ success: false, error: 'Unexpected result format from database' }),
              { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
            );
          }

          console.log('🔍 Parsed resultData:', JSON.stringify(resultData, null, 2));

          // Validate result structure
          if (!resultData || !resultData.success) {
            return new Response(
              JSON.stringify({ success: false, error: resultData?.error || 'Approval failed' }),
              { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
            );
          }

          // Send notifications using data from PostgreSQL function
          const notificationData = resultData.notification_data;
          console.log('🔍 Notification data check:', {
            has_notification_data: !!notificationData,
            has_user_id: !!resultData.user_id,
            has_user_email: !!resultData.user_email,
            notification_data_keys: notificationData ? Object.keys(notificationData) : null,
            full_resultData_keys: Object.keys(resultData),
          });
          
          // Always try to send notifications if we have user_id, even if notification_data is missing
          if (resultData.user_id) {
            console.log(`📤 Sending notifications for approval to user ${resultData.user_id}`);
            
            // Send push notification with exact text from design
            try {
              const pushTitle = 'KYC Approved';
              const pushBody = 'Your KYC has been approved. Please reload the app to access your new status privileges';
              
              console.log('📤 Invoking send-push-notification with:', {
                userId: resultData.user_id,
                title: pushTitle,
                body: pushBody,
              });
              
              const { data: pushResult, error: pushInvokeError } = await supabase.functions.invoke(
                'send-push-notification',
                {
                  body: {
                    userId: resultData.user_id,
                    title: pushTitle,
                    body: pushBody,
                    data: {
                      type: 'kyc_approved',
                      verification_id: approveParams.verification_id,
                      action: 'reload_app',
                    },
                    priority: 'high',
                    sound: 'default',
                    color: '#6B46C1', // Purple color matching ChainCola brand
                  },
                },
              );
              logFunctionInvokeResult('send-push-notification (approve)', pushResult, pushInvokeError);
            } catch (pushError: any) {
              console.error('⚠️ Failed to send push notification:', {
                error: pushError?.message || pushError?.toString(),
                stack: pushError?.stack,
              });
              // Don't fail the request if notification fails
            }

            // Send email notification
            if (resultData.user_email) {
              try {
                const emailSubject = notificationData?.email_subject || 'Your Identity Has Been Successfully Verified! 🎉';
                const userName = resultData.user_name || 'User';
                const emailHtml = notificationData?.email_html || `
                  <!DOCTYPE html>
                  <html>
                  <head>
                    <meta charset="utf-8">
                    <meta name="viewport" content="width=device-width, initial-scale=1.0">
                    <style>
                      body { 
                        font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif; 
                        line-height: 1.6; 
                        color: #333; 
                        margin: 0; 
                        padding: 0; 
                        background-color: #F3F4F6;
                      }
                      .email-container { 
                        max-width: 600px; 
                        margin: 0 auto; 
                        background-color: #FFFFFF;
                      }
                      .header-logo {
                        padding: 30px 30px 20px 30px;
                        text-align: center;
                      }
                      .logo {
                        display: inline-flex;
                        align-items: center;
                        gap: 8px;
                        font-size: 24px;
                        font-weight: bold;
                        color: #11181C;
                      }
                      .logo-icon {
                        width: 32px;
                        height: 32px;
                        background-color: #10B981;
                        border-radius: 8px;
                        display: inline-flex;
                        align-items: center;
                        justify-content: center;
                        color: white;
                        font-weight: bold;
                        font-size: 20px;
                      }
                      .illustration-box {
                        border: 1px solid #E5E7EB;
                        border-radius: 12px;
                        padding: 50px 40px;
                        margin: 20px 30px;
                        background-color: #FAFAFA;
                        text-align: center;
                        position: relative;
                      }
                      .high-five-container {
                        position: relative;
                        display: inline-block;
                        margin: 20px 0;
                      }
                      .hand-left {
                        font-size: 60px;
                        display: inline-block;
                        transform: rotate(-15deg);
                        margin-right: -10px;
                        position: relative;
                        z-index: 2;
                      }
                      .hand-right {
                        font-size: 60px;
                        display: inline-block;
                        transform: rotate(15deg);
                        margin-left: -10px;
                        position: relative;
                        z-index: 2;
                      }
                      .starburst {
                        position: absolute;
                        top: 50%;
                        left: 50%;
                        transform: translate(-50%, -50%);
                        width: 120px;
                        height: 120px;
                        background: radial-gradient(circle, #10B981 0%, rgba(16, 185, 129, 0.3) 100%);
                        border-radius: 50%;
                        z-index: 1;
                        opacity: 0.8;
                      }
                      .star-decoration {
                        position: absolute;
                        font-size: 24px;
                      }
                      .star-1 { top: 10px; left: 20px; color: #10B981; }
                      .star-2 { top: 15px; right: 25px; color: #FFFFFF; }
                      .plus-decoration {
                        position: absolute;
                        font-size: 16px;
                        color: #10B981;
                        opacity: 0.6;
                      }
                      .plus-1 { top: 30px; left: 10px; }
                      .plus-2 { bottom: 20px; right: 15px; }
                      .main-heading {
                        font-size: 28px;
                        font-weight: bold;
                        color: #11181C;
                        margin: 30px 30px 20px 30px;
                        line-height: 1.3;
                      }
                      .content {
                        padding: 0 30px 30px 30px;
                        color: #374151;
                        font-size: 16px;
                      }
                      .content p {
                        margin: 15px 0;
                      }
                      .support-link {
                        color: #3B82F6;
                        text-decoration: none;
                      }
                      .closing {
                        margin-top: 30px;
                        padding-top: 20px;
                        border-top: 1px solid #E5E7EB;
                      }
                    </style>
                  </head>
                  <body>
                    <div class="email-container">
                      <div class="header-logo">
                        <div class="logo">
                          <span class="logo-icon">C</span>
                          <span>ChainCola</span>
                        </div>
                      </div>
                      
                      <div class="illustration-box">
                        <div class="high-five-container">
                          <div class="starburst"></div>
                          <span class="hand-left">👋</span>
                          <span class="hand-right">✋</span>
                          <span class="star-decoration star-1">⭐</span>
                          <span class="star-decoration star-2">⭐</span>
                          <span class="plus-decoration plus-1">+</span>
                          <span class="plus-decoration plus-2">+</span>
                        </div>
                      </div>
                      
                      <h1 class="main-heading">Your Identity Has Been Successfully Verified! 🎉</h1>
                      
                      <div class="content">
                        <p>Hello ${userName},</p>
                        <p>Your identity has been successfully verified!</p>
                        <p>You can now convert your crypto to cash seamlessly and move money across borders with ease.</p>
                        <p>Thank you for completing your verification.</p>
                        <p>Need help? Reach out to our support team at <a href="mailto:support@chaincola.com" class="support-link">support@chaincola.com</a>.</p>
                        
                        <div class="closing">
                          <p style="margin: 0;">Your biggest fan,<br><strong>Davina from ChainCola</strong></p>
                        </div>
                      </div>
                    </div>
                  </body>
                  </html>
                `;
                
                console.log('📧 Invoking send-email with:', {
                  to: resultData.user_email,
                  subject: emailSubject,
                  has_html: !!emailHtml,
                });
                
                const { data: emailResult, error: emailInvokeError } = await supabase.functions.invoke('send-email', {
                  body: {
                    to: resultData.user_email,
                    subject: emailSubject,
                    html: emailHtml,
                    userId: resultData.user_id,
                    type: 'verification_approved',
                  },
                });
                logFunctionInvokeResult('send-email (approve)', emailResult, emailInvokeError);
              } catch (emailError: any) {
                console.error('⚠️ Failed to send email notification:', {
                  error: emailError?.message || emailError?.toString(),
                  stack: emailError?.stack,
                });
                // Don't fail the request if notification fails
              }
            } else {
              console.warn('⚠️ Missing user_email for approval notification');
            }
          } else {
            console.warn('⚠️ Missing user_id for approval notification');
          }

          result = resultData;
        }
        break;

      case 'reject':
        {
          const rejectParams = params as RejectRequest;
          
          if (!rejectParams.verification_id) {
            return new Response(
              JSON.stringify({ success: false, error: 'Verification ID is required' }),
              { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
            );
          }
          
          if (!rejectParams.rejection_reason || rejectParams.rejection_reason.trim() === '') {
            return new Response(
              JSON.stringify({ success: false, error: 'Rejection reason is required' }),
              { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
            );
          }

          console.log(`❌ Admin ${adminUserId.substring(0, 8)}... rejecting verification ${rejectParams.verification_id}`);

          // Call PostgreSQL function
          const { data: dbResult, error: dbError } = await supabase.rpc('admin_reject_verification', {
            p_verification_id: rejectParams.verification_id,
            p_admin_user_id: adminUserId,
            p_rejection_reason: rejectParams.rejection_reason,
          });

          if (dbError) {
            console.error('❌ Error rejecting verification:', dbError);
            return new Response(
              JSON.stringify({ success: false, error: dbError.message }),
              { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
            );
          }

          // Handle JSONB result - it might be wrapped in an array or returned directly
          // JSONB from PostgreSQL RPC might also be returned as a string that needs parsing
          let resultData: any;
          
          console.log('🔍 Raw dbResult from admin_reject_verification:', JSON.stringify(dbResult, null, 2));
          console.log('🔍 dbResult type:', typeof dbResult, 'isArray:', Array.isArray(dbResult));
          
          if (Array.isArray(dbResult) && dbResult.length > 0) {
            resultData = dbResult[0];
          } else if (dbResult && typeof dbResult === 'object') {
            resultData = dbResult;
          } else if (typeof dbResult === 'string') {
            // JSONB might be returned as a string
            try {
              resultData = JSON.parse(dbResult);
            } catch (parseError) {
              console.error('❌ Failed to parse JSONB string:', parseError);
              return new Response(
                JSON.stringify({ success: false, error: 'Failed to parse database result' }),
                { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
              );
            }
          } else {
            console.error('❌ Unexpected result format from admin_reject_verification:', {
              dbResult,
              type: typeof dbResult,
              isArray: Array.isArray(dbResult),
            });
            return new Response(
              JSON.stringify({ success: false, error: 'Unexpected result format from database' }),
              { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
            );
          }

          console.log('🔍 Parsed resultData:', JSON.stringify(resultData, null, 2));

          // Validate result structure
          if (!resultData || !resultData.success) {
            return new Response(
              JSON.stringify({ success: false, error: resultData?.error || 'Rejection failed' }),
              { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
            );
          }

          // Send notifications using data from PostgreSQL function
          const notificationData = resultData.notification_data;
          console.log('🔍 Notification data check:', {
            has_notification_data: !!notificationData,
            has_user_id: !!resultData.user_id,
            has_user_email: !!resultData.user_email,
            notification_data_keys: notificationData ? Object.keys(notificationData) : null,
            full_resultData_keys: Object.keys(resultData),
          });
          
          // Always try to send notifications if we have user_id, even if notification_data is missing
          if (resultData.user_id) {
            console.log(`📤 Sending notifications for rejection to user ${resultData.user_id}`);
            
            // Send push notification
            try {
              const pushTitle = notificationData?.push_title || '❌ Account Verification Rejected';
              const pushBody = notificationData?.push_body || `Your verification was rejected. Reason: ${rejectParams.rejection_reason.substring(0, 100)}. Please review and resubmit.`;
              
              console.log('📤 Invoking send-push-notification with:', {
                userId: resultData.user_id,
                title: pushTitle,
                body: pushBody,
              });
              
              const { data: pushResult, error: pushInvokeError } = await supabase.functions.invoke(
                'send-push-notification',
                {
                  body: {
                    userId: resultData.user_id,
                    title: pushTitle,
                    body: pushBody,
                    data: {
                      type: notificationData?.type || 'verification_rejected',
                      verification_id: rejectParams.verification_id,
                      rejection_reason: rejectParams.rejection_reason,
                    },
                    priority: 'high',
                  },
                },
              );
              logFunctionInvokeResult('send-push-notification (reject)', pushResult, pushInvokeError);
            } catch (pushError: any) {
              console.error('⚠️ Failed to send push notification:', {
                error: pushError?.message || pushError?.toString(),
                stack: pushError?.stack,
              });
              // Don't fail the request if notification fails
            }

            // Send email notification
            if (resultData.user_email) {
              try {
                const emailSubject = notificationData?.email_subject || 'Your Tier 2 KYC Verification was Declined';
                const userName = resultData.user_name || 'User';
                const rejectionReason = rejectParams.rejection_reason || 'Invalid Address';
                const emailHtml = notificationData?.email_html || `
                  <!DOCTYPE html>
                  <html>
                  <head>
                    <meta charset="utf-8">
                    <meta name="viewport" content="width=device-width, initial-scale=1.0">
                    <style>
                      body { 
                        font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif; 
                        line-height: 1.6; 
                        color: #333; 
                        margin: 0; 
                        padding: 0; 
                        background-color: #F3F4F6;
                      }
                      .email-container { 
                        max-width: 600px; 
                        margin: 0 auto; 
                        background-color: #FFFFFF;
                      }
                      .header-logo {
                        padding: 30px 30px 20px 30px;
                        text-align: center;
                      }
                      .logo {
                        display: inline-flex;
                        align-items: center;
                        gap: 8px;
                        font-size: 24px;
                        font-weight: bold;
                        color: #11181C;
                      }
                      .logo-icon {
                        width: 32px;
                        height: 32px;
                        background-color: #10B981;
                        border-radius: 8px;
                        display: inline-flex;
                        align-items: center;
                        justify-content: center;
                        color: white;
                        font-weight: bold;
                        font-size: 20px;
                      }
                      .illustration-box {
                        border: 1px solid #E5E7EB;
                        border-radius: 12px;
                        padding: 50px 40px;
                        margin: 20px 30px;
                        background-color: #FAFAFA;
                        text-align: center;
                        position: relative;
                      }
                      .illustration-container {
                        position: relative;
                        display: inline-block;
                        margin: 20px 0;
                      }
                      .document-icon {
                        font-size: 60px;
                        display: inline-block;
                        position: relative;
                        z-index: 1;
                      }
                      .warning-triangle {
                        position: absolute;
                        top: -10px;
                        left: 50%;
                        transform: translateX(-50%);
                        font-size: 50px;
                        color: #10B981;
                        z-index: 2;
                      }
                      .card-icon {
                        position: absolute;
                        bottom: -5px;
                        right: -20px;
                        font-size: 30px;
                        z-index: 1;
                        opacity: 0.7;
                      }
                      .card-text {
                        position: absolute;
                        bottom: 5px;
                        right: -15px;
                        font-size: 10px;
                        font-weight: bold;
                        color: #666;
                        z-index: 2;
                      }
                      .x-decoration {
                        position: absolute;
                        font-size: 20px;
                        color: #DC2626;
                        opacity: 0.5;
                      }
                      .x-1 { top: 10px; left: 10px; }
                      .x-2 { bottom: 15px; left: 20px; }
                      .circle-decoration {
                        position: absolute;
                        width: 12px;
                        height: 12px;
                        border: 2px solid #10B981;
                        border-radius: 50%;
                        opacity: 0.4;
                      }
                      .circle-1 { top: 20px; right: 15px; }
                      .circle-2 { bottom: 10px; right: 30px; }
                      .main-heading {
                        font-size: 28px;
                        font-weight: bold;
                        color: #6B46C1;
                        margin: 30px 30px 20px 30px;
                        line-height: 1.3;
                      }
                      .content {
                        padding: 0 30px 30px 30px;
                        color: #374151;
                        font-size: 16px;
                      }
                      .content p {
                        margin: 15px 0;
                      }
                      .greeting {
                        font-size: 18px;
                        font-weight: 600;
                        margin-bottom: 20px;
                      }
                      .admin-note-box {
                        margin: 25px 0;
                        padding: 20px;
                        background-color: #FFFBEB;
                        border: 2px solid #F59E0B;
                        border-radius: 8px;
                      }
                      .admin-note-title {
                        font-weight: 700;
                        margin-bottom: 12px;
                        color: #92400E;
                        font-size: 16px;
                        display: flex;
                        align-items: center;
                        gap: 8px;
                      }
                      .admin-note-content {
                        color: #78350F;
                        font-size: 15px;
                        line-height: 1.6;
                        white-space: pre-wrap;
                        word-wrap: break-word;
                      }
                      .instructions {
                        margin-top: 25px;
                        padding: 20px;
                        background-color: #F9FAFB;
                        border-radius: 8px;
                      }
                      .instructions-title {
                        font-weight: 600;
                        margin-bottom: 15px;
                        color: #111827;
                      }
                      .instructions-list {
                        margin: 0;
                        padding-left: 20px;
                      }
                      .instructions-list li {
                        margin: 10px 0;
                        color: #4B5563;
                        line-height: 1.6;
                      }
                      .support-link {
                        color: #3B82F6;
                        text-decoration: none;
                      }
                      .closing {
                        margin-top: 30px;
                        padding-top: 20px;
                        border-top: 1px solid #E5E7EB;
                      }
                    </style>
                  </head>
                  <body>
                    <div class="email-container">
                      <div class="header-logo">
                        <div class="logo">
                          <span class="logo-icon">C</span>
                          <span>ChainCola</span>
                        </div>
                      </div>
                      
                      <div class="illustration-box">
                        <div class="illustration-container">
                          <div class="document-icon">📄</div>
                          <div class="warning-triangle">⚠️</div>
                          <div class="card-icon">💳</div>
                          <div class="card-text">XXXXX</div>
                          <span class="x-decoration x-1">✕</span>
                          <span class="x-decoration x-2">✕</span>
                          <div class="circle-decoration circle-1"></div>
                          <div class="circle-decoration circle-2"></div>
                        </div>
                      </div>
                      
                      <h1 class="main-heading">Your Tier 2 KYC Verification was Declined</h1>
                      
                      <div class="content">
                        <p class="greeting">Hey ${userName}!</p>
                        
                        <p>Unfortunately, your proof of address verification could not be approved due to the following reason(s):</p>
                        
                        <div class="reason-section">
                          <p class="reason-label">Reason for Decline:</p>
                          <p class="reason-text">${rejectionReason.replace(/</g, '&lt;').replace(/>/g, '&gt;')}</p>
                        </div>
                        
                        <div class="admin-note-box">
                          <p class="admin-note-title">
                            <span>📝</span>
                            <span>Admin's Note - What You Need to Fix:</span>
                          </p>
                          <div class="admin-note-content">${rejectionReason.replace(/</g, '&lt;').replace(/>/g, '&gt;')}</div>
                        </div>
                        
                        <div class="instructions">
                          <p class="instructions-title">To proceed, please resubmit a valid proof of address that meets the required guidelines. Ensure that:</p>
                          <ol class="instructions-list">
                            <li>The document is clear and legible.</li>
                            <li>It includes your full name and current address.</li>
                            <li>It is an accepted document type (e.g., utility bill, bank statement).</li>
                          </ol>
                        </div>
                        
                        <p>If you have any questions or need assistance, our support team <a href="mailto:support@chaincola.com" class="support-link">support@chaincola.com</a> is here to help.</p>
                        
                        <div class="closing">
                          <p style="margin: 0;">Your biggest fan,<br><strong>Davina from ChainCola</strong></p>
                        </div>
                      </div>
                    </div>
                  </body>
                  </html>
                `;
                
                console.log('📧 Invoking send-email with:', {
                  to: resultData.user_email,
                  subject: emailSubject,
                  has_html: !!emailHtml,
                });
                
                const { data: emailResult, error: emailInvokeError } = await supabase.functions.invoke('send-email', {
                  body: {
                    to: resultData.user_email,
                    subject: emailSubject,
                    html: emailHtml,
                    userId: resultData.user_id,
                    type: 'verification_rejected',
                  },
                });
                logFunctionInvokeResult('send-email (reject)', emailResult, emailInvokeError);
              } catch (emailError: any) {
                console.error('⚠️ Failed to send email notification:', {
                  error: emailError?.message || emailError?.toString(),
                  stack: emailError?.stack,
                });
                // Don't fail the request if notification fails
              }
            } else {
              console.warn('⚠️ Missing user_email for rejection notification');
            }
          } else {
            console.warn('⚠️ Missing user_id for rejection notification');
          }

          result = resultData;
        }
        break;

      default:
        return new Response(
          JSON.stringify({ success: false, error: `Unknown action: ${action}` }),
          { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
    }

    return new Response(
      JSON.stringify(result),
      { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  } catch (error) {
    console.error('❌ Error:', error);
    return new Response(
      JSON.stringify({ success: false, error: error.message || 'Internal server error' }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});
