// Edge Function to create the verification-documents storage bucket
// This is a one-time setup function

import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

serve(async (req) => {
  // Handle CORS preflight requests
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  try {
    // Get service role key from Supabase secrets (set via: supabase secrets set SUPABASE_SERVICE_ROLE_KEY=xxx)
    const supabaseUrl = Deno.env.get('SUPABASE_URL') ?? '';
    const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '';

    if (!supabaseUrl || !supabaseServiceKey) {
      return new Response(
        JSON.stringify({ 
          success: false, 
          error: 'Missing Supabase environment variables. Please set SUPABASE_SERVICE_ROLE_KEY as a Supabase secret.' 
        }),
        {
          status: 500,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        }
      );
    }

    const supabase = createClient(supabaseUrl, supabaseServiceKey, {
      auth: {
        autoRefreshToken: false,
        persistSession: false,
      },
    });

    console.log('🔍 Checking if verification-documents bucket exists...');

    // Check if bucket already exists
    const { data: buckets, error: listError } = await supabase.storage.listBuckets();

    if (listError) {
      console.error('❌ Error listing buckets:', listError);
      return new Response(
        JSON.stringify({ success: false, error: listError.message }),
        {
          status: 500,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        }
      );
    }

    const bucketExists = buckets?.some((bucket) => bucket.name === 'verification-documents');

    if (bucketExists) {
      console.log('✅ Bucket "verification-documents" already exists');
      return new Response(
        JSON.stringify({ success: true, message: 'Bucket already exists' }),
        {
          status: 200,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        }
      );
    }

    console.log('📦 Creating verification-documents bucket...');

    // Create the bucket
    const { data, error } = await supabase.storage.createBucket('verification-documents', {
      public: false, // Private bucket - users can only access their own files
      fileSizeLimit: 10485760, // 10MB limit
      allowedMimeTypes: ['image/jpeg', 'image/jpg', 'image/png', 'image/webp'],
    });

    if (error) {
      console.error('❌ Error creating bucket:', error);
      return new Response(
        JSON.stringify({ success: false, error: error.message }),
        {
          status: 500,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        }
      );
    }

    console.log('✅ Successfully created verification-documents bucket');

    return new Response(
      JSON.stringify({
        success: true,
        message: 'Bucket created successfully',
        bucket: data,
      }),
      {
        status: 200,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      }
    );
  } catch (error: any) {
    console.error('❌ Unexpected error:', error);
    return new Response(
      JSON.stringify({ success: false, error: error.message }),
      {
        status: 500,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      }
    );
  }
});

