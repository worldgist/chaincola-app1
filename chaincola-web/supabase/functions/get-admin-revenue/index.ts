// Get Admin Revenue Edge Function
// Returns revenue summary and detailed records for admin dashboard

import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

interface RevenueQueryParams {
  start_date?: string;
  end_date?: string;
  revenue_type?: string;
  source?: string;
  currency?: string;
  limit?: number;
  offset?: number;
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

    // Get user from auth token
    const authHeader = req.headers.get('Authorization');
    if (!authHeader) {
      return new Response(
        JSON.stringify({
          success: false,
          error: 'Missing authorization header',
        }),
        {
          status: 401,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        }
      );
    }

    // Get user ID from JWT token
    const token = authHeader.replace('Bearer ', '');
    const {
      data: { user },
      error: authError,
    } = await supabase.auth.getUser(token);

    if (authError || !user) {
      return new Response(
        JSON.stringify({
          success: false,
          error: 'Invalid or expired token',
        }),
        {
          status: 401,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        }
      );
    }

    // Check if user is admin (maybeSingle: no row / multiple rows → not admin)
    const { data: profile, error: profileError } = await supabase
      .from('user_profiles')
      .select('is_admin')
      .eq('user_id', user.id)
      .maybeSingle();

    if (profileError || !profile?.is_admin) {
      return new Response(
        JSON.stringify({
          success: false,
          error: 'Unauthorized. Admin access required.',
        }),
        {
          status: 403,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        }
      );
    }

    // Parse query parameters
    const url = new URL(req.url);
    const params: RevenueQueryParams = {
      start_date: url.searchParams.get('start_date') || undefined,
      end_date: url.searchParams.get('end_date') || undefined,
      revenue_type: url.searchParams.get('revenue_type') || undefined,
      source: url.searchParams.get('source') || undefined,
      currency: url.searchParams.get('currency') || undefined,
      limit: parseInt(url.searchParams.get('limit') || '100'),
      offset: parseInt(url.searchParams.get('offset') || '0'),
    };

    // Build query
    let query = supabase
      .from('admin_revenue')
      .select('*', { count: 'exact' })
      .order('created_at', { ascending: false })
      .range(params.offset || 0, (params.offset || 0) + (params.limit || 100) - 1);

    // Apply filters
    if (params.start_date) {
      query = query.gte('created_at', params.start_date);
    }
    if (params.end_date) {
      query = query.lte('created_at', params.end_date);
    }
    if (params.revenue_type) {
      query = query.eq('revenue_type', params.revenue_type);
    }
    if (params.source) {
      query = query.eq('source', params.source);
    }
    if (params.currency) {
      query = query.eq('currency', params.currency);
    }

    const { data: revenueRecords, error: queryError, count } = await query;

    if (queryError) {
      console.error('❌ Error fetching revenue:', queryError);
      return new Response(
        JSON.stringify({
          success: false,
          error: 'Failed to fetch revenue records',
          details: queryError.message,
        }),
        {
          status: 500,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        }
      );
    }

    // Get summary statistics
    let summaryQuery = supabase
      .from('admin_revenue')
      .select('revenue_type, source, currency, amount, amount_ngn');

    if (params.start_date) {
      summaryQuery = summaryQuery.gte('created_at', params.start_date);
    }
    if (params.end_date) {
      summaryQuery = summaryQuery.lte('created_at', params.end_date);
    }
    if (params.revenue_type) {
      summaryQuery = summaryQuery.eq('revenue_type', params.revenue_type);
    }
    if (params.source) {
      summaryQuery = summaryQuery.eq('source', params.source);
    }
    if (params.currency) {
      summaryQuery = summaryQuery.eq('currency', params.currency);
    }

    const { data: allRevenue, error: summaryError } = await summaryQuery;

    let summary = {
      total_revenue_ngn: 0,
      total_transactions: 0,
      by_type: {} as Record<string, { count: number; total_ngn: number }>,
      by_source: {} as Record<string, { count: number; total_ngn: number }>,
      by_currency: {} as Record<string, { count: number; total: number; total_ngn: number }>,
    };

    if (!summaryError && allRevenue) {
      summary.total_transactions = allRevenue.length;
      
      allRevenue.forEach((record) => {
        const ngnAmount = parseFloat(record.amount_ngn || '0');
        summary.total_revenue_ngn += ngnAmount;

        // By type
        if (!summary.by_type[record.revenue_type]) {
          summary.by_type[record.revenue_type] = { count: 0, total_ngn: 0 };
        }
        summary.by_type[record.revenue_type].count++;
        summary.by_type[record.revenue_type].total_ngn += ngnAmount;

        // By source
        if (!summary.by_source[record.source]) {
          summary.by_source[record.source] = { count: 0, total_ngn: 0 };
        }
        summary.by_source[record.source].count++;
        summary.by_source[record.source].total_ngn += ngnAmount;

        // By currency
        if (!summary.by_currency[record.currency]) {
          summary.by_currency[record.currency] = { count: 0, total: 0, total_ngn: 0 };
        }
        summary.by_currency[record.currency].count++;
        summary.by_currency[record.currency].total += parseFloat(record.amount || '0');
        summary.by_currency[record.currency].total_ngn += ngnAmount;
      });
    }

    return new Response(
      JSON.stringify({
        success: true,
        data: {
          records: revenueRecords || [],
          summary: summary,
          pagination: {
            total: count || 0,
            limit: params.limit,
            offset: params.offset,
            has_more: (count || 0) > (params.offset || 0) + (params.limit || 100),
          },
        },
      }),
      {
        status: 200,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      }
    );
  } catch (error: any) {
    console.error('❌ Exception in get-admin-revenue function:', error);
    return new Response(
      JSON.stringify({
        success: false,
        error: error.message || 'Failed to fetch admin revenue',
      }),
      {
        status: 500,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      }
    );
  }
});










