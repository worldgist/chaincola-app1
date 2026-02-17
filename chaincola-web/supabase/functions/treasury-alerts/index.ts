// Treasury Alerts Service
// Handles alert creation, sending via email/Slack, and alert management

import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  try {
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const supabaseKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    const supabase = createClient(supabaseUrl, supabaseKey);

    const authHeader = req.headers.get('Authorization');
    if (!authHeader) {
      return new Response(
        JSON.stringify({ success: false, error: 'Missing authorization header' }),
        { status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const token = authHeader.replace('Bearer ', '');
    const { data: { user }, error: authError } = await supabase.auth.getUser(token);

    if (authError || !user) {
      return new Response(
        JSON.stringify({ success: false, error: 'Unauthorized' }),
        { status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Check if user is admin
    const { data: profile } = await supabase
      .from('user_profiles')
      .select('is_admin')
      .eq('user_id', user.id)
      .single();

    if (!profile?.is_admin) {
      return new Response(
        JSON.stringify({ success: false, error: 'Admin access required' }),
        { status: 403, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const body = await req.json();
    const { action } = body;

    switch (action) {
      case 'getAlerts': {
        const { status, severity, limit = 50, offset = 0 } = body;

        let query = supabase
          .from('treasury_alerts')
          .select('*')
          .order('created_at', { ascending: false })
          .range(offset, offset + limit - 1);

        if (status) {
          query = query.eq('status', status);
        }

        if (severity) {
          query = query.eq('severity', severity);
        }

        const { data: alerts, error } = await query;

        if (error) {
          return new Response(
            JSON.stringify({ success: false, error: error.message }),
            { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
          );
        }

        return new Response(
          JSON.stringify({ success: true, data: alerts }),
          { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
      }

      case 'acknowledgeAlert': {
        const { alertId } = body;

        if (!alertId) {
          return new Response(
            JSON.stringify({ success: false, error: 'Alert ID is required' }),
            { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
          );
        }

        const { data: alert, error } = await supabase
          .from('treasury_alerts')
          .update({
            status: 'ACKNOWLEDGED',
            acknowledged_by: user.id,
            acknowledged_at: new Date().toISOString()
          })
          .eq('id', alertId)
          .select()
          .single();

        if (error) {
          return new Response(
            JSON.stringify({ success: false, error: error.message }),
            { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
          );
        }

        return new Response(
          JSON.stringify({ success: true, data: alert }),
          { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
      }

      case 'resolveAlert': {
        const { alertId, resolutionNotes } = body;

        if (!alertId) {
          return new Response(
            JSON.stringify({ success: false, error: 'Alert ID is required' }),
            { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
          );
        }

        const { data: alert, error } = await supabase
          .from('treasury_alerts')
          .update({
            status: 'RESOLVED',
            resolved_by: user.id,
            resolved_at: new Date().toISOString(),
            resolution_notes: resolutionNotes || null
          })
          .eq('id', alertId)
          .select()
          .single();

        if (error) {
          return new Response(
            JSON.stringify({ success: false, error: error.message }),
            { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
          );
        }

        return new Response(
          JSON.stringify({ success: true, data: alert }),
          { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
      }

      case 'sendPendingAlerts': {
        // Get pending alerts that haven't been sent
        const { data: pendingAlerts, error: fetchError } = await supabase
          .from('treasury_alerts')
          .select('*')
          .eq('status', 'PENDING')
          .is('sent_at', null)
          .order('created_at', { ascending: true })
          .limit(10);

        if (fetchError) {
          return new Response(
            JSON.stringify({ success: false, error: fetchError.message }),
            { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
          );
        }

        const results: any[] = [];

        for (const alert of pendingAlerts || []) {
          // Get alert configuration
          const { data: config } = await supabase
            .from('alert_configurations')
            .select('*')
            .eq('alert_type', alert.alert_type)
            .eq('is_active', true)
            .single();

          if (!config) {
            continue; // Skip if no configuration
          }

          // Check severity threshold
          const severityLevels = { 'LOW': 1, 'MEDIUM': 2, 'HIGH': 3, 'CRITICAL': 4 };
          const alertSeverity = severityLevels[alert.severity as keyof typeof severityLevels] || 0;
          const minSeverity = severityLevels[config.min_severity_to_send as keyof typeof severityLevels] || 0;

          if (alertSeverity < minSeverity) {
            continue; // Skip if below threshold
          }

          const channelsSent: string[] = [];

          // Send via email if enabled
          if (config.email_enabled && config.email_recipients && config.email_recipients.length > 0) {
            try {
              await sendEmailAlert(alert, config.email_recipients, supabase);
              channelsSent.push('EMAIL');
            } catch (error) {
              console.error('Error sending email alert:', error);
            }
          }

          // Send via Slack if enabled
          if (config.slack_enabled && config.slack_webhook_url) {
            try {
              await sendSlackAlert(alert, config.slack_webhook_url);
              channelsSent.push('SLACK');
            } catch (error) {
              console.error('Error sending Slack alert:', error);
            }
          }

          // Update alert with sent status
          if (channelsSent.length > 0) {
            await supabase
              .from('treasury_alerts')
              .update({
                status: 'SENT',
                channels_sent: channelsSent,
                sent_at: new Date().toISOString()
              })
              .eq('id', alert.id);

            results.push({
              alert_id: alert.id,
              channels_sent: channelsSent,
              success: true
            });
          }
        }

        return new Response(
          JSON.stringify({ success: true, data: results }),
          { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
      }

      case 'getAlertConfigurations': {
        const { data: configs, error } = await supabase
          .from('alert_configurations')
          .select('*')
          .order('alert_type', { ascending: true });

        if (error) {
          return new Response(
            JSON.stringify({ success: false, error: error.message }),
            { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
          );
        }

        return new Response(
          JSON.stringify({ success: true, data: configs }),
          { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
      }

      case 'updateAlertConfiguration': {
        const { alertType, config } = body;

        if (!alertType) {
          return new Response(
            JSON.stringify({ success: false, error: 'Alert type is required' }),
            { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
          );
        }

        const { data: updatedConfig, error } = await supabase
          .from('alert_configurations')
          .update(config)
          .eq('alert_type', alertType)
          .select()
          .single();

        if (error) {
          return new Response(
            JSON.stringify({ success: false, error: error.message }),
            { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
          );
        }

        return new Response(
          JSON.stringify({ success: true, data: updatedConfig }),
          { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
      }

      default:
        return new Response(
          JSON.stringify({ success: false, error: 'Invalid action' }),
          { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
    }
  } catch (error: any) {
    console.error('Treasury alerts error:', error);
    return new Response(
      JSON.stringify({ success: false, error: error.message }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});

async function sendEmailAlert(alert: any, recipients: string[], supabase: any): Promise<void> {
  // Use the send-email function
  const { error } = await supabase.functions.invoke('send-email', {
    body: {
      to: recipients,
      subject: `[Treasury Alert] ${alert.title}`,
      html: `
        <div style="font-family: Arial, sans-serif; padding: 20px;">
          <h2 style="color: ${getSeverityColor(alert.severity)};">${alert.title}</h2>
          <p><strong>Severity:</strong> ${alert.severity}</p>
          <p><strong>Type:</strong> ${alert.alert_type}</p>
          ${alert.asset ? `<p><strong>Asset:</strong> ${alert.asset}</p>` : ''}
          <p><strong>Message:</strong></p>
          <p>${alert.message}</p>
          ${alert.details ? `<pre style="background: #f5f5f5; padding: 10px; border-radius: 5px;">${JSON.stringify(alert.details, null, 2)}</pre>` : ''}
          <p style="margin-top: 20px; color: #666; font-size: 12px;">
            This is an automated alert from the Treasury Management System.
          </p>
        </div>
      `
    }
  });

  if (error) {
    throw new Error(`Failed to send email: ${error.message}`);
  }
}

async function sendSlackAlert(alert: any, webhookUrl: string): Promise<void> {
  const severityEmoji: Record<string, string> = {
    'LOW': '🟡',
    'MEDIUM': '🟠',
    'HIGH': '🔴',
    'CRITICAL': '🚨'
  };

  const payload = {
    text: `${severityEmoji[alert.severity] || '⚠️'} ${alert.title}`,
    blocks: [
      {
        type: 'header',
        text: {
          type: 'plain_text',
          text: `${severityEmoji[alert.severity] || '⚠️'} ${alert.title}`
        }
      },
      {
        type: 'section',
        fields: [
          {
            type: 'mrkdwn',
            text: `*Severity:*\n${alert.severity}`
          },
          {
            type: 'mrkdwn',
            text: `*Type:*\n${alert.alert_type}`
          },
          ...(alert.asset ? [{
            type: 'mrkdwn',
            text: `*Asset:*\n${alert.asset}`
          }] : [])
        ]
      },
      {
        type: 'section',
        text: {
          type: 'mrkdwn',
          text: `*Message:*\n${alert.message}`
        }
      }
    ]
  };

  const response = await fetch(webhookUrl, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload)
  });

  if (!response.ok) {
    throw new Error(`Slack API error: ${response.status}`);
  }
}

function getSeverityColor(severity: string): string {
  const colors: Record<string, string> = {
    'LOW': '#FFA500',
    'MEDIUM': '#FF8C00',
    'HIGH': '#FF4500',
    'CRITICAL': '#DC143C'
  };
  return colors[severity] || '#000000';
}
