// Shared configuration for push notifications
// Logo URL for push notifications - should be publicly accessible
// IMPORTANT: Ensure logo.png is uploaded to Supabase Storage at: app-assets/logo.png

// Get Supabase URL from environment
const SUPABASE_URL = Deno.env.get('SUPABASE_URL') || 'https://slleojsdpctxhlsoyenr.supabase.co';

// Chaincola logo URL - using logo.png from Supabase Storage
// This is the ChainCola logo, NOT the Expo logo
// Path: Supabase Storage → app-assets bucket → logo.png
export const CHAINCOLA_LOGO_URL = `${SUPABASE_URL}/storage/v1/object/public/app-assets/logo.png`;

// Alternative: If logo is hosted on a CDN or external URL, use:
// export const CHAINCOLA_LOGO_URL = 'https://your-cdn.com/logo.png';

// Notification icon - uses ChainCola logo.png
// This ensures all push notifications use the ChainCola logo instead of Expo's default
export const NOTIFICATION_ICON = CHAINCOLA_LOGO_URL;
