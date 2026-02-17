// Send Push Notification Edge Function
// Sends push notifications to users via Expo Push Notification service

import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { NOTIFICATION_ICON, CHAINCOLA_LOGO_URL } from "../_shared/notification-config.ts";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

// Expo Push Notification API endpoint
const EXPO_PUSH_API_URL = 'https://exp.host/--/api/v2/push/send';

interface PushNotificationRequest {
  userId: string;
  title: string;
  body: string;
  data?: any;
  sound?: 'default' | null;
  priority?: 'default' | 'normal' | 'high';
  badge?: number;
  color?: string; // Android notification color (hex format, e.g., '#368395')
  imageUrl?: string; // Image URL to display in notification
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
    const body: PushNotificationRequest = await req.json();
    const { userId, title, body: message, data, sound = 'default', priority = 'high', badge, color, imageUrl } = body;

    if (!userId || !title || !message) {
      return new Response(
        JSON.stringify({
          success: false,
          error: 'Missing required fields: userId, title, body',
        }),
        {
          status: 400,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        }
      );
    }

    // Check user notification preferences
    const { data: preferences } = await supabase
      .from('user_notification_preferences')
      .select('push_notifications_enabled')
      .eq('user_id', userId)
      .maybeSingle();

    // If preferences exist and push is disabled, skip
    if (preferences && preferences.push_notifications_enabled === false) {
      console.log(`⏭️ Push notifications disabled for user ${userId}`);
      return new Response(
        JSON.stringify({
          success: true,
          message: 'Push notifications disabled by user',
          skipped: true,
        }),
        {
          status: 200,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        }
      );
    }

    // Get push tokens for user
    const { data: tokens, error: tokensError } = await supabase
      .from('push_notification_tokens')
      .select('token, platform')
      .eq('user_id', userId);

    if (tokensError) {
      console.error('❌ Error fetching push tokens:', tokensError);
      return new Response(
        JSON.stringify({
          success: false,
          error: 'Failed to fetch push tokens',
        }),
        {
          status: 500,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        }
      );
    }

    if (!tokens || tokens.length === 0) {
      console.log(`⏭️ No push tokens found for user ${userId}`);
      return new Response(
        JSON.stringify({
          success: true,
          message: 'No push tokens found',
          skipped: true,
        }),
        {
          status: 200,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        }
      );
    }

    // Prepare push notification messages
    const messages = tokens.map(({ token, platform }) => {
      const notificationMessage: any = {
        to: token,
        sound: sound,
        title: title,
        body: message,
        data: data || {},
        priority: priority,
        badge: badge,
        icon: NOTIFICATION_ICON,
      };
      
      // Add color for Android notifications (Expo supports this)
      if (color && platform === 'android') {
        notificationMessage.color = color;
      }
      
      // Add image URL for rich notifications (Expo supports this)
      // Automatically use ChainCola logo if no image is provided
      const notificationImage = imageUrl || CHAINCOLA_LOGO_URL;
      if (notificationImage) {
        notificationMessage.image = notificationImage;
      }
      
      return notificationMessage;
    });

    // Send push notifications via Expo API
    console.log(`📤 Sending ${messages.length} push notification(s) to user ${userId}`);

    const response = await fetch(EXPO_PUSH_API_URL, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Accept': 'application/json',
        'Accept-Encoding': 'gzip, deflate',
      },
      body: JSON.stringify(messages),
    });

    if (!response.ok) {
      const errorText = await response.text();
      console.error('❌ Expo Push API error:', response.status, errorText);
      return new Response(
        JSON.stringify({
          success: false,
          error: `Expo Push API error: ${response.status}`,
        }),
        {
          status: response.status,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        }
      );
    }

    const result = await response.json();
    console.log('✅ Push notifications sent:', result);

    // Check for errors in response
    const errors = result.data?.filter((item: any) => item.status === 'error') || [];
    if (errors.length > 0) {
      console.warn('⚠️ Some push notifications failed:', errors);
    }

    return new Response(
      JSON.stringify({
        success: true,
        message: 'Push notifications sent',
        sent: result.data?.filter((item: any) => item.status === 'ok').length || 0,
        failed: errors.length,
        result: result,
      }),
      {
        status: 200,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      }
    );
  } catch (error: any) {
    console.error('❌ Exception sending push notification:', error);
    return new Response(
      JSON.stringify({
        success: false,
        error: error.message || 'Failed to send push notification',
      }),
      {
        status: 500,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      }
    );
  }
});















