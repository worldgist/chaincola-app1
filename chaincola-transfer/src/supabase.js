const { createClient } = require('@supabase/supabase-js');

// supabase-js v2 instantiates a RealtimeClient unconditionally, which on Node.js
// versions < 22 requires a WebSocket implementation. We don't actually use
// realtime here, but we still need to pass a transport so client construction
// succeeds on Node 20.
let WebSocketTransport = null;
try {
  // eslint-disable-next-line global-require
  WebSocketTransport = require('ws');
} catch {
  WebSocketTransport = null;
}

function getSupabaseAdminClient() {
  const url = (process.env.SUPABASE_URL || '').trim();
  const serviceKey = (process.env.SUPABASE_SERVICE_ROLE_KEY || '').trim();
  if (!url || !serviceKey) {
    throw new Error('Missing Supabase env: SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY are required');
  }
  return createClient(url, serviceKey, {
    auth: { persistSession: false, autoRefreshToken: false },
    ...(WebSocketTransport ? { realtime: { transport: WebSocketTransport } } : {}),
  });
}

function extractBearerToken(req) {
  const authHeader = req.headers.authorization || req.headers.Authorization || '';
  if (typeof authHeader !== 'string') return '';
  const m = authHeader.match(/^Bearer\s+(.+)$/i);
  return m ? m[1].trim() : '';
}

async function requireUserFromBearer(req) {
  const token = extractBearerToken(req);
  if (!token) {
    const err = new Error('Missing Authorization: Bearer <access_token>');
    err.statusCode = 401;
    throw err;
  }

  const supabase = getSupabaseAdminClient();
  const { data: userRes, error: userErr } = await supabase.auth.getUser(token);
  if (userErr || !userRes?.user) {
    const err = new Error('Unauthorized');
    err.statusCode = 401;
    throw err;
  }

  const user = userRes.user;
  let isAdmin = false;
  try {
    const { data: profile } = await supabase
      .from('user_profiles')
      .select('is_admin, role')
      .eq('user_id', user.id)
      .maybeSingle();
    isAdmin = profile?.is_admin === true || profile?.role === 'admin';
  } catch {
    // If the lookup fails we treat the caller as a non-admin user.
    isAdmin = false;
  }

  return { supabase, user, isAdmin };
}

async function requireAdminFromBearer(req) {
  const { supabase, user, isAdmin } = await requireUserFromBearer(req);
  if (!isAdmin) {
    const err = new Error('Forbidden: admin access required');
    err.statusCode = 403;
    throw err;
  }
  return { supabase, user };
}

module.exports = {
  getSupabaseAdminClient,
  requireAdminFromBearer,
  requireUserFromBearer,
};

