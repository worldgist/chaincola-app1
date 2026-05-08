import { serve } from 'https://deno.land/std@0.168.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

interface EmailAttachment {
  filename: string;
  content: string; // base64 encoded content
  type?: string; // MIME type (e.g., 'application/pdf')
  disposition?: 'attachment' | 'inline';
}

interface SendEmailRequest {
  to: string;
  subject: string;
  html: string;
  userId?: string;
  type?: 'transaction' | 'notification' | 'system' | 'statement';
  attachments?: EmailAttachment[];
}

serve(async (req) => {
  // Handle CORS preflight
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  try {
    // Initialize Supabase client
    const supabaseUrl = Deno.env.get('SUPABASE_URL') ?? '';
    const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '';
    const supabase = createClient(supabaseUrl, supabaseServiceKey);

    // Parse request body
    const body: SendEmailRequest = await req.json();
    const { to, subject, html, userId, type = 'notification', attachments = [] } = body;

    if (!to || !subject || !html) {
      return new Response(
        JSON.stringify({
          success: false,
          error: 'Missing required fields: to, subject, html',
        }),
        {
          status: 400,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        }
      );
    }

    // Check user email notification preferences if userId is provided (skip for user-requested statements)
    if (userId && type !== 'statement') {
      const { data: preferences } = await supabase
        .from('user_notification_preferences')
        .select('email_notifications_enabled')
        .eq('user_id', userId)
        .maybeSingle();

      const { data: profile } = await supabase
        .from('user_profiles')
        .select('email_notifications')
        .eq('user_id', userId)
        .maybeSingle();

      const emailEnabled = preferences?.email_notifications_enabled ?? profile?.email_notifications ?? true;

      if (!emailEnabled) {
        console.log(`⏭️ Email notifications disabled for user ${userId}`);
        return new Response(
          JSON.stringify({
            success: true,
            message: 'Email notifications disabled by user',
            skipped: true,
          }),
          {
            status: 200,
            headers: { ...corsHeaders, 'Content-Type': 'application/json' },
          }
        );
      }
    }

    // Email providers: Resend is preferred whenever RESEND_API_KEY is set (matches product default).
    // Use SendGrid only when EMAIL_SERVICE=sendgrid and SENDGRID_API_KEY is set (and no Resend key).
    const emailService = (Deno.env.get('EMAIL_SERVICE') || 'resend').toLowerCase();
    const resendApiKey = Deno.env.get('RESEND_API_KEY');
    const sendgridApiKey = Deno.env.get('SENDGRID_API_KEY');
    const fromEmail = Deno.env.get('FROM_EMAIL') || 'noreply@chaincola.com';
    const fromName = Deno.env.get('FROM_NAME') || 'ChainCola';

    let emailSent = false;
    let error: string | null = null;

    const useSendgridOnly =
      emailService === 'sendgrid' && !!sendgridApiKey && !resendApiKey;

    // Send email using Resend (used whenever API key is configured)
    if (resendApiKey && !useSendgridOnly) {
      try {
        // Prepare attachments for Resend API
        const resendAttachments = attachments.map(att => ({
          filename: att.filename,
          content: att.content, // base64 string
          type: att.type || 'application/pdf',
        }));

        const emailPayload: any = {
          from: `${fromName} <${fromEmail}>`,
          to: [to],
          subject: subject,
          html: html,
        };

        // Add attachments if provided
        if (resendAttachments.length > 0) {
          emailPayload.attachments = resendAttachments;
        }

        const resendResponse = await fetch('https://api.resend.com/emails', {
          method: 'POST',
          headers: {
            'Authorization': `Bearer ${resendApiKey}`,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify(emailPayload),
        });

        if (!resendResponse.ok) {
          const errorData = await resendResponse.text();
          throw new Error(`Resend API error: ${resendResponse.status} - ${errorData}`);
        }

        const result = await resendResponse.json();
        console.log('✅ Email sent via Resend:', result);
        emailSent = true;
      } catch (err: any) {
        console.error('❌ Resend error:', err);
        error = err.message || 'Failed to send email via Resend';
      }
    }
    // Send email using SendGrid (when Resend is not configured or explicitly SendGrid-only)
    else if (emailService === 'sendgrid' && sendgridApiKey) {
      try {
        // Prepare attachments for SendGrid API
        const sendgridAttachments = attachments.map(att => ({
          content: att.content, // base64 string
          filename: att.filename,
          type: att.type || 'application/pdf',
          disposition: att.disposition || 'attachment',
        }));

        const sendgridPayload: any = {
          personalizations: [
            {
              to: [{ email: to }],
              subject: subject,
            },
          ],
          from: {
            email: fromEmail,
            name: fromName,
          },
          content: [
            {
              type: 'text/html',
              value: html,
            },
          ],
        };

        // Add attachments if provided
        if (sendgridAttachments.length > 0) {
          sendgridPayload.attachments = sendgridAttachments;
        }

        const sendgridResponse = await fetch('https://api.sendgrid.com/v3/mail/send', {
          method: 'POST',
          headers: {
            'Authorization': `Bearer ${sendgridApiKey}`,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify(sendgridPayload),
        });

        if (!sendgridResponse.ok) {
          const errorData = await sendgridResponse.text();
          throw new Error(`SendGrid API error: ${sendgridResponse.status} - ${errorData}`);
        }

        console.log('✅ Email sent via SendGrid');
        emailSent = true;
      } catch (err: any) {
        console.error('❌ SendGrid error:', err);
        error = err.message || 'Failed to send email via SendGrid';
      }
    }
    // Fallback: Use Supabase's built-in email (limited functionality)
    else if (emailService === 'supabase') {
      try {
        // Note: Supabase doesn't have a direct email API, so we'll use auth.users email
        // This is a fallback and may not work for all use cases
        console.log('⚠️ Supabase email service is limited. Consider using Resend or SendGrid.');
        // For now, we'll just log it
        emailSent = false;
        error = 'Supabase email service not fully implemented. Please configure Resend or SendGrid.';
      } catch (err: any) {
        console.error('❌ Supabase email error:', err);
        error = err.message || 'Failed to send email via Supabase';
      }
    }
    else {
      error =
        'No email provider configured. Set RESEND_API_KEY (recommended) or SENDGRID_API_KEY with EMAIL_SERVICE=sendgrid.';
      console.error('❌', error);
    }

    if (!emailSent) {
      return new Response(
        JSON.stringify({
          success: false,
          error: error || 'Failed to send email',
        }),
        {
          status: 500,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        }
      );
    }

    return new Response(
      JSON.stringify({
        success: true,
        message: 'Email sent successfully',
      }),
      {
        status: 200,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      }
    );
  } catch (error: any) {
    console.error('❌ Exception sending email:', error);
    return new Response(
      JSON.stringify({
        success: false,
        error: error.message || 'An error occurred while sending email',
      }),
      {
        status: 500,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      }
    );
  }
});
